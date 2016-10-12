const config = require('config');
const Snoowrap = require('snoowrap');
const Discord = require('discord.js');
const mongoose = require('mongoose');
const moment = require('moment-timezone');

const bot = new Discord.Client();

const reddit = new Snoowrap({
  userAgent: 'InventoryReader v1.0.0 by /u/demipixel',
    clientId: config.get('reddit.id'),
    clientSecret: config.get('reddit.secret'),
    username: config.get('reddit.username'),
    password: config.get('reddit.password')
});

const MongoDB = mongoose.connect('mongodb://localhost:27017').connection;

MongoDB.on('error', function(err) {
  console.log('Database error: ' + err.message);
});

MongoDB.once('open', function() {
  console.log('Connected to database');
});

const dbSchemas = {
  discord: require('./schemas/discord')(mongoose),
  reddit: require('./schemas/reddit')(mongoose),
  ban: require('./schemas/ban')(mongoose)
}

const db = require('./db')(dbSchemas);

let DEFAULT_GUILD = null;
const savedActions = {};
const MESSAGES = {
  DB_ERR: 'There was an error accessing the database.'
}

function log(...strs) {
  console.log(moment().format('LLL')+']',...strs);
}

bot.on('ready', () => {
  log('Bot connected to Discord');
  DEFAULT_GUILD = bot.guilds.first();

  setInterval(() => {
    db.getExpiredBans((err, bans) => {
      if (err) return;
      bans.forEach(ban => {
        ban.ended = true;
        ban.save(err => {
          if (err) return;
          DEFAULT_GUILD.channels.find('name', 'mod-action').sendMessage('<@'+ban.to+'> has been unbanned after '+getLengthFormat(ban.length));
          DEFAULT_GUILD.unban(ban.to).catch(err => {
            DEFAULT_GUILD.channels.find('name', 'mod-action').sendMessage('There was an error trying to unban <@'+ban.to+'>!');
          });
        });
      });
    });
  }, 10*1000);
});

bot.on('disconnected', () => {
  bot.login(config.get('discord.token'));
});

bot.on('guildMemberAdd', (guild, member) => {
  guild.defaultChannel.sendMessage('Welcome, '+member+'! Go to #reddit and type `!verify`!');
});

const REDDIT_VERIFICATION_STRING = 'I verify that I am %user% on the Rocket League Market Discord: %code%'

function checkCommand(str, cmd) { return str.startsWith(cmd+' ') || str == cmd; }

bot.on('message', msg => {
  log('['+(msg.member?msg.member.id:msg.channel.id)+'] #'+(msg.channel.name || 'pm')+'-'+(msg.member ? msg.member.user.username : msg.channel.id)+': '+msg.content);

  const respond = (mention, str) => {
    msg.channel.sendMessage(str !== undefined && msg.member ? (mention === true ? msg.member : mention)+': '+str : mention).catch(e => console.log(e));
    return true;
  }

  const checkErr = (err) => {
    if (err) {
      respond(true, MESSAGES.DB_ERR);
      console.log(err);
      return true;
    } else return false;
  }

  const isMod = msg.member ? msg.member.roles.find('name', 'Moderator') || msg.member.roles.find('name', 'Admin') : false;
  const modAction = msg.channel.name == 'mod-action';

  if (checkCommand(msg.content, '!verify')) {
    if (msg.member.roles.find('name', 'Reddit Verified')) return respond(true, 'You are already reddit verified!');
    db.getUser(msg.member.id, (err, user) => {
      if (err) return console.log(err) || respond(true, 'There was an error fetching your database entry!');
      const link = 'https://www.reddit.com/message/compose?to=RLMarket&subject=Reddit%20Verification&message='
                    +encodeURIComponent(REDDIT_VERIFICATION_STRING.replace('%user%', msg.member.user.username).replace('%code%', user.redditKey));
      msg.member.user.sendMessage('Click on the following link. After hitting "send", you should be verified within ten seconds\n\n'+link);
    });
  } else if (checkCommand(msg.content, '!reddit')) {
    const user = msg.mentions.users.array()[0];
    if (!user) return respond(true, 'Usage: `!reddit @User`');
    db.getUser(user.id, (err, dbUser) => {
      if (checkErr(err)) return;
      else if (!dbUser || !dbUser.reddit) respond(true, 'This user has not connected their reddit account yet!');
      else respond(true, 'This user\'s reddit account is /u/'+dbUser.reddit+' (https://www.reddit.com/u/'+dbUser.reddit+')');
    });
  } else if (checkCommand(msg.content, '!redditban') && isMod && msg.member) {
    const username = msg.content.replace('!redditban', '').trim();
    if (!username) return respond(true, 'Usage: `!redditban redditUsernameHere`');
    db.createRedditBan(username, msg.member.user.id, (err, alreadyBanned) => {
      if (err) respond(true, 'There was an error with the database!');
      else if (alreadyBanned) respond(true, 'This user is already banned!');
      else {
        respond(true, '/u/'+username+' is now reddit banned.');
        db.getUserReddit(username, (err, user) => {
          if (err) respond(true, 'There was an error with the database!');
          else if (user) respond(true, '**WARNING** This user has already linked their reddit account: <@'+user.discord+'>');
        });
      }
    });
  } else if (checkCommand(msg.content, '!rmredditban') && isMod && msg.member) {
    const username = msg.content.replace('!rmredditban', '').trim();
    if (!username) return respond(true, 'Usage: `!rmredditban redditUsernameHere`');
    db.removeRedditBan(username, (err, success) => {
      if (checkErr(err)) return;
      else if (!success) respond(true, 'That user was not banned.');
      else respond(true, '/u/'+username+'\'s reddit ban has been lifted!');
    });
  } else if (checkCommand(msg.content, '!bans') && isMod) {
    if (!modAction) return respond(true, 'This command can only be performed in #mod-action');

    db.getUserFromString(msg.channel.guild, msg.content.replace('!bans ', ''), (err, userId) => {
      if (checkErr(err)) return;
      else if (!userId) return respond(true, 'Could not find that user!');

      db.getBans(userId, (err, bans) => {
        if (checkErr(err)) return;
        if (!bans.length) return respond(true, 'This user has no bans.');
        respond(true, 'Active bans are in bold:\n'+bans.map((b,i) => {
          const bold = !b.ended ? '**' : '';
          const cancel = b.cancelDate ? '\n    Cancelled by <@'+b.cancelFrom+'> ('+getTimeFormat(b.cancelDate) : '';
          return (i+1)+'. '+bold+
                  (b.length ? 'Banned for ' + getLengthFormat(b.length) + ' by ' : 'Kicked by ')+
                  '<@'+b.from+'> ('+getTimeFormat(b.date)+')'+
                  cancel
                +bold;
        }).join('\n'));
      });
    });
  } else if (checkCommand(msg.content, '!ban') && isMod) {
    if (!modAction) return respond(true, 'This command can only be performed in #mod-action');

    const match = msg.content.match(/!ban ([^ ]+) ([0-9mhd]+) ([^]+)/);
    if (!match) return respond(true, 'Usage: `!ban @User <time> <reason and proof>` (e.g. `!ban '+bot.user+' 2d12h '+
                                     'Hard evidence and proof. Please include both text proof (permanent) and image proof (deletable, but better as proof))');
    const length = parseTimeFormat(match[2]);
    if (typeof length == 'string') return respond(true, length);
    if (match[3].length >= 1750) return respond(true, 'Your proof must be under 1750 characters.');

    db.getUserFromString(msg.channel.guild, match[1], (err, userId) => {
      if (checkErr(err)) return;
      else if (!userId) return respond(true, 'Could not find that user!');

      const member = msg.channel.guild.members.get(userId);

      savedActions[msg.member.id] = {
        type: 'ban',
        id: userId,
        member: member,
        length: length,
        reason: match[3],
        from: msg.member.id,
        time: Date.now()
      };
      respond(true, 'Are you sure you\'d like to issue a '+getLengthFormat(length)+' ban on <@'+userId+'>? '+(!member?'**They are not currently in this discord.** ':'')+'Respond with `y` or `n`.');
    });
  } else if (checkCommand(msg.content, '!kick') && isMod) {
    if (!modAction) return respond(true, 'This command can only be performed in #mod-action');

    const match = msg.content.match(/!kick ([^ ]+) ([^]+)/);
    if (!match) return respond(true, 'Usage: `!kick @User <reason and proof>` (e.g. `!ban '+bot.user+' '+
                                     'Hard evidence and proof. Please include both text proof (permanent) and image proof (deletable, but better as proof))');
    if (match[2].length >= 1750) return respond(true, 'Your proof must be under 1750 characters.');

    db.getUserFromString(msg.channel.guild, match[1], (err, userId) => {
      if (checkErr(err)) return;
      else if (!userId) return respond(true, 'Could not find that user!');

      const member = msg.channel.guild.members.get(userId);

      savedActions[msg.member.id] = {
        type: 'ban',
        id: userId,
        member: member,
        length: 0,
        reason: match[3],
        from: msg.member.id,
        time: Date.now()
      };
      respond(true, 'Are you sure you\'d like to kick '+member+'? Respond with `y` or `n`.');
    });
  } else if ((msg.content == 'y' || msg.content == 'n' ) && isMod && modAction) {
    if (msg.content == 'n') {
      delete savedActions[msg.member.id];
      respond('Action cancelled.');
    }

    if (savedActions[msg.member.id]) {
      const action = savedActions[msg.member.id];
      if (action.time + 1000*60*5 < Date.now()) {
        respond(true, 'This action has expired.');
        delete savedActions[msg.member.id];
        return;
      }
      if (action.type == 'ban') {
        db.createBan(msg.channel.guild, action.member || action.id, action.from, action.length, action.reason, (err) => {
          if (checkErr(err)) return;
          if (action.length == 0) {
            //action.member.user.sendMessage('You have been kicked from '+msg.channel.guild.name+'.');
            respond('<@'+action.id+'> has been kicked. Their id: `'+action.id+'`');
          } else {
            //action.member.user.sendMessage('You have been banned from '+msg.channel.guild.name+' for '+getLengthFormat(action.length)+'.');
            respond('<@'+action.id+'> has been banned for '+getLengthFormat(action.length)+'. Their id: `'+action.id+'`');
          }
          delete savedActions[msg.member.id];
        });
      } else if (action.type == 'cancelban') {
        db.cancelBan(action.ban, action.from, action.reason, err => {
          if (checkErr(err)) return;
          msg.channel.guild.unban(action.ban.to).then(() => {
            respond(true, '<@'+action.ban.to+'> has been unbanned.');
          }).catch(err => {
            console.log(err);
            respond(true, 'I cancelled <@'+action.ban.to+'\'s ban in the database but there was an error removing the Discord ban. An admin may need to manually unban.');
          });
        });
      } else {
        respond(true, 'Unknown action type!');
      }
    }
  } else if (checkCommand(msg.content, '!baninfo')) {
    const match = msg.content.match(/!baninfo ([^ ]+) (\d+)/);
    if (!match) return respond(true, 'Usage: `!baninfo <user> <ban #>`. Use `!bans <user>` to get a list of a user\'s bans.');

    const item = parseInt(match[2]) - 1;
    if (item == -1) return respond(true, 'There is no item 0!');
    db.getUserFromString(msg.channel.guild, match[1], (err, userId) => {
      if (checkErr(err)) return;
      else if (!userId) return respond(true, 'Could not find that user!');

      db.getBans(userId, (err, bans) => {
        if (checkErr(err)) return;
        if (item >= bans.length) {
          if (bans.length > 2) return respond(true, 'There are only '+bans.length+' bans on this user!');
          else if (bans.length == 1) return respond(true, 'There is only 1 ban on this user!');
          else return respond(true, 'This user has no bans!');
        }
        const b = bans[item];
        const wasBan = b.length > 0;
        let str = '<@'+b.to+'> was '+(wasBan ? 'banned' : 'kicked')+' by <@'+b.from+'>'+(wasBan ? ' for '+getLengthFormat(b.length) : '');
        str += ' on '+getTimeFormat(b.date)+'\n';
        if (b.cancelDate) str += '    Cancelled by <@'+b.cancelFrom+'> on '+getTimeFormat(b.cancelDate)+'\n';
        str += '**REASON**\n'+b.reason;
        if (b.cancelReason) str += '\n**CANCEL REASON**\n'+b.cancelReason;
        respond(true, str);
      });
    });
  } else if (checkCommand(msg.content, '!cancelban')) {
    const match = msg.content.match(/!cancelban ([^ ]+) (\d+) ([^]+)/);

    if (!match) return respond(true, 'Usage: `!cancelban @User <ban #> <reason and proof>` (e.g. `!cancelban '+bot.user+' '+'Mistyped user)');
    if (match[3].length >= 1750) return respond(true, 'Your proof must be under 1750 characters.');

    const item = parseInt(match[2]) - 1;
    if (item == -1) return respond(true, 'There is no item 0!');

    db.getUserFromString(msg.channel.guild, match[1], (err, userId) => {
      if (checkErr(err)) return;
      else if (!userId) return respond(true, 'Could not find that user!');

      db.getBans(userId, (err, bans) => {
        if (checkErr(err)) return;
        if (item >= bans.length) {
          if (bans.length > 2) return respond(true, 'There are only '+bans.length+' bans on this user!');
          else if (bans.length == 1) return respond(true, 'There is only 1 ban on this user!');
          else return respond(true, 'This user has no bans!');
        } else if (bans[item].ended) return respond(true, 'This ban has already ended!');

        savedActions[msg.member.id] = {
          type: 'cancelban',
          from: msg.member.id,
          reason: match[3],
          ban: bans[item],
          time: Date.now()
        };
        respond(true, 'Are you sure you\'d like to cancel that ban created by <@'+bans[item].from+'> on '+getTimeFormat(bans[item].date)+'? Respond with `y` or `n`.');
      });
    });
  }
});

function getTimeFormat(date) {
  return moment(date).tz('America/New_York').format('LLL z');
}

function getLengthFormat(num) { // Convert number like
  if (!num) return '0m';
  const minutes = Math.floor(num/60) % 60;
  const hours = Math.floor(num/60/60) % 24;
  const days = Math.floor(num/60/60/24);
  return ((days ? days + ' days ' : '')+(hours ? hours + ' hrs ' : '')+(minutes ? minutes + ' min' : '')).trim();
}

function parseTimeFormat(str) { // Parse a string such as "3d4h30m"
  const match = str.match(/((\d+)d)?((\d+)h)?((\d+)m)?/);
  const minutes = parseInt(match[6]) || 0;
  const hours = parseInt(match[4]) || 0;
  const days = parseInt(match[2]) || 0;

  if (!match) return 'Your time must be in the format: <num>d<num>h<num>m for days, hours and minutes respectively. (e.g. `2d50m`';
  else if (!minutes && !hours && !days) return 'You must include a time greater than 0';
  else if (minutes > 60) return 'Minutes must be less than 60';
  else if (hours > 24) return 'Hours must be less than 24';
  else return minutes*60 + hours*60*60 + days*60*60*24; // Return in seconds
}

require('./redditVerify')(bot, reddit, db);


bot.login(config.get('discord.token'));