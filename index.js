const config = require('config');
const Snoowrap = require('snoowrap');
const Discord = require('discord.js');
const mongoose = require('mongoose');
const moment = require('moment');

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
  reddit: require('./schemas/reddit')(mongoose)
}

const db = require('./db')(dbSchemas);

function log(...strs) {
  console.log(moment().format('LLL')+']',...strs);
}

bot.on('ready', () => {
  log('Bot connected to Discord');
});

bot.on('disconnected', () => {
  bot.login(config.get('discord.token'));
});

bot.on('guildMemberAdd', (guild, member) => {
  guild.defaultChannel.sendMessage('Welcome, '+member+'! Go to #reddit and type `!verify`!');
});

const REDDIT_VERIFICATION_STRING = 'I verify that I am %user% on the Rocket League Market Discord: %code%'

bot.on('message', msg => {
  log('['+(msg.member?msg.member.id:msg.channel.id)+'] #'+(msg.channel.name || 'pm')+'-'+(msg.member ? msg.member.user.username : msg.channel.id)+': '+msg.content);

  const respond = (mention, str) => {
    msg.channel.sendMessage(str !== undefined && msg.member ? (mention === true ? msg.member : mention)+': '+str : mention).catch(e => console.log(e));
  }

  const isMod = msg.member ? msg.member.roles.find('name', 'Moderator') || msg.member.roles.find('name', 'Admin') : false;

  if (msg.content.startsWith('!verify') || msg.content == '!verify') {
    if (msg.member.roles.find('name', 'Reddit Verified')) return respond(true, 'You are already reddit verified!');
    db.getUser(msg.member.id, (err, user) => {
      if (err) return console.log(err) || respond(true, 'There was an error fetching your database entry!');
      const link = 'https://www.reddit.com/message/compose?to=RLMarket&subject=Reddit%20Verification&message='
                    +encodeURIComponent(REDDIT_VERIFICATION_STRING.replace('%user%', msg.member.user.username).replace('%code%', user.redditKey));
      msg.member.user.sendMessage('Click on the following link. After hitting "send", you should be verified within ten seconds\n\n'+link);
    });
  } else if (msg.content.startsWith('!reddit ') || msg.content == '!reddit') {
    const user = msg.mentions.users.array()[0];
    if (!user) return respond(true, 'Usage: `!reddit @User`');
    db.getUser(user.id, (err, dbUser) => {
      if (err) respond(true, 'There was an error accessing the database.');
      else if (!dbUser || !dbUser.reddit) respond(true, 'This user has not connected their reddit account yet!');
      else respond(true, 'This user\'s reddit account is /u/'+dbUser.reddit+' (https://www.reddit.com/u/'+dbUser.reddit+')');
    });
  } else if (msg.content.startsWith('!redditban') && isMod && msg.member) {
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
  } else if (msg.content.startsWith('!rmredditban') && isMod && msg.member) {
    const username = msg.content.replace('!rmredditban', '').trim();
    if (!username) return respond(true, 'Usage: `!rmredditban redditUsernameHere`');
    db.removeRedditBan(username, (err, success) => {
      if (err) respond(true, 'There was an error accessing the database.');
      else if (!success) respond(true, 'That user was not banned.');
      else respond(true, '/u/'+username+'\'s reddit ban has been lifted!');
    });
  }
});

require('./redditVerify')(bot, reddit, db);


bot.login(config.get('discord.token'));