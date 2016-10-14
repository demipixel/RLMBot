module.exports = function(config, bot, reddit, db, sw, requestRep) {

  setInterval(() => {
    reddit.getUnreadMessages().then(listing => {
      listing.forEach(item => {
        if (redditVerify(item)) return;
        if (requestRepThread(item)) return;
      });
    });
  }, 10*1000);

  function redditVerify(item) {
    if (item.was_comment) return false; // Only PMs
    const match = item.body.match(/^I verify that I am [^ ]+ on the Rocket League Market Discord: (.+)/)
    if (!match) return false;

    item.author.fetch().then(info => {
      db.getUserRedditKey(match[1], (err, user) => {
        if (err) item.reply('There was an error trying to access the database!');
        else if (!user) item.reply('Could not find that user. Are you sure you have the correct code?');
        else {
          db.getUserReddit(item.author.name, (err, discUser) => {
            if (err) return item.reply('There was an error trying to access the database!');
            else if (discUser && discUser != user.discord) return item.reply('This reddit is already associated with another account!');

            db.hasRedditBan(item.author.name, (err, isBanned) => {
              if (err) return item.reply('There was an error trying to access the database!');
              item.markAsRead();

              const discordUser = bot.users.get(user.discord);
              const guild = bot.guilds.array()[0];
              const modChannel = guild.channels.find('name', 'mod-action')
              if (!guild.members.get(user.discord)) {
                discordUser.sendMessage('You are not in the Rocket League Market discord!');
              } else if (guild.members.get(user.discord).roles.find('name', 'Reddit Verified')) {
                discordUser.sendMessage('You are already verified!');
              } else if (Date.now() - info.created_utc < 1000*60*60*24*7) {
                discordUser.sendMessage('Your reddit account must be at least a week old.')
                if (isBanned) modChannel.sendMessage('@here: '+discordUser + ' (/u/'+item.author.name+') tried to join our server, but they are marked as reddit banned AND their account is less than a week old! No action has been taken.');
              } else {
                user.reddit = item.author.name;
                user.save();
                if (!isBanned) {
                  guild.members.get(user.discord).addRole(guild.roles.find('name', 'Reddit Verified'));
                  discordUser.sendMessage('You are now verified!');
                } else {
                  discordUser.sendMessage('Your verification is pending review.');
                  modChannel.sendMessage('@here: '+discordUser + ' (/u/'+item.author.name+') tried to join our server, but they are marked as reddit banned! No action has been taken.');
                }
              }
            });
          });
        }
      });
    });
    return true;
  }

  function requestRepThread(item) {
    const match = item.body.match(/^https?:\/\/(www\.)?steamcommunity.com\/(profiles|id)\/([^ /]+)/);
    const match2 = item.body.match(/^\d{17}$/);

    requestRep(item.body, (dbErr, strErr, link) => {
      if (dbErr) console.log(err) || item.reply('There was an error trying to access the database!');
      else if (strErr) item.reply(strErr);
      else if (link) item.reply(link);
      item.markAsRead();
    });
    return !!match || !!match2;
  }
}