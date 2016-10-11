
module.exports = function(bot, reddit, db) {

  setInterval(() => {
    reddit.getUnreadMessages().then(listing => {
      listing.forEach(item => {
        if (item.was_comment) return; // Only PMs
        item.markAsRead();
        const match = item.body.match(/^I verify that I am [^ ]+ on the Rocket League Market Discord: (.+)/)
        if (match) {
          item.author.fetch().then(info => {
            db.getUserRedditKey(match[1], (err, user) => {
              if (err) item.reply('There was an error trying to access the database!');
              else if (!user) item.reply('Could not find that user. Are you sure you have the correct code?');
              else {
                db.hasRedditBan(item.author.name, (err, isBanned) => {
                  const discordUser = bot.users.get(user.discord);
                  const guild = bot.guilds.array()[0];
                  const modChannel = guild.channels.find('name', 'mod-action')
                  if (!guild.members.get(user.discord)) {
                    discordUser.sendMessage('You are not in the Rocket League Market discord!');
                  } else if (guild.members.get(user.discord).roles.find('name', 'Reddit Verified')) {
                    discordUser.sendMessage('You are already verified!');
                  } else if (Date.now() - info.created_utc < 1000*60*60*24*7) {
                    discordUser.sendMessage('Your reddit account must be at least a week old.')
                    if (isBanned) modChannel.sendMessage(discordUser + ' (/u/'+item.author.name+') tried to join our server, but they are marked as reddit banned AND their account is less than a week old! No action has been taken.');
                  } else {
                    user.reddit = item.author.name;
                    user.save();
                    if (!isBanned) {
                      guild.members.get(user.discord).addRole(guild.roles.find('name', 'Reddit Verified'));
                      discordUser.sendMessage('You are now verified!');
                    } else {
                      discordUser.sendMessage('Your verification is pending review.');
                      modChannel.sendMessage(discordUser + ' (/u/'+item.author.name+') tried to join our server, but they are marked as reddit banned! No action has been taken.');
                    }
                  }
                });
              }
            });
          })
        }
      });
    });
  }, 10*1000);
}