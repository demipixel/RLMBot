const gen = require('random-seed');

module.exports = function(db) {

  /* GET AND CREATE DISCORD USERS */

  function getUser(id, cb) {
    db.discord.find({ discord: id }, (err, users) => {
      if (err || users[0]) return cb(err, users ? users[0] : null);
      createUser(id, cb);
    });
  }

  function createUser(id, cb) {
    const g = gen.create();
    g.seed(id);
    const newUser = new db.discord({
      discord: id,
      redditKey: generateCode(g)
    });
    newUser.save(err => cb(err, newUser));
  }

  function getUserRedditKey(key, cb) {
    db.discord.find({ redditKey: key }, (err, users) => {
      cb(err, users ? users[0] : null);
    });
  }

  function getUserReddit(reddit, cb) {
    db.discord.find({ reddit: reddit }, (err, users) => {
      cb(err, users ? users[0] : null);
    });
  }

  /* REDDIT BANS */

  function hasRedditBan(username, cb) {
    db.reddit.find({ reddit: username }, (err, users) => {
      cb(err, users && users[0] ? true : false);
    });
  }

  function createRedditBan(username, addedBy, cb) {
    hasRedditBan(username, (err, hasBan) => {
      if (hasBan || err) return cb(err, hasBan);
      const ban = new db.reddit({
        reddit: username,
        addedBy: addedBy
      });
      ban.save(err => cb(err, false, ban));
    });
  }

  function removeRedditBan(username, cb) {
    db.reddit.find({ reddit: username}, (err, users) => {
      if (!users || !users[0]) cb(err, false);
      else users[0].remove(err => cb(err, true));
    });
  }

  /* DISCORD BANS */

  function createBan(guild, member, from, length, reason, cb) {
    getBans(typeof member == 'object' ? member.user.id : member, true, (err, bans) => {
      if (err) return cb(err);
      const ban = new db.ban({
        to: typeof member == 'object' ? member.user.id : member,
        from: from,
        length: length,
        endDate: length != 0 ? new Date(Date.now() + length*1000) : new Date(),
        ended: length == 0 ? true : false,
        reason: reason
      });
      ban.save(err => {
        if (err) return cb(err);
        else if (typeof member != 'object') return cb(err);

        const action = length == 0 ? 'kick' : 'ban';
        member[action]().then(() => cb(null)).catch(err => {
          ban.remove()
          bans.forEach(ban => {
            cancelBan(ban, from, 'New ban created');
          });
          cb(err);
        });
      });
    });
  }

  function cancelBan(ban, from, reason, cb) {
    ban.cancelDate = new Date();
    ban.cancelFrom = from;
    ban.cancelReason = reason;
    ban.ended = true;
    ban.save(err => cb ? cb(err) : null);
  }

  function getBans(of, active, cb) {
    if (typeof active == 'function') { cb = active; active = false; }
    const opt = { to: of };
    if (active) opt.ended = false;
    db.ban.find(opt, null, { sort: { date: 1 }}, (err, bans) => {
      cb(err, bans || []);
    });
  }

  function getExpiredBans(cb) {
    db.ban.find({ endDate: {'$lte': new Date() }, ended: false }, (err, bans) => {
      cb(err, bans || []);
    });
  }


  const redditRegex = /^\/?u\/(.+)/;

  function getUserFromString(guild, str, cb) {
    const u = guild.members.get(str.slice(2, -1)) || guild.members.get(str);
    if (u) return cb(null, u.id);
    else if (str.match(redditRegex)) {
      getUserReddit(str.match(redditRegex)[1], (err, user) => {
        cb(err, user ? user.discord : null);
      });
    } else return cb(null, null);
  }

  return {
    getUser: getUser,
    getUserRedditKey: getUserRedditKey,
    getUserReddit: getUserReddit,

    hasRedditBan: hasRedditBan,
    createRedditBan: createRedditBan,
    removeRedditBan: removeRedditBan,

    createBan: createBan,
    cancelBan: cancelBan,
    getBans: getBans,
    getExpiredBans: getExpiredBans,

    getUserFromString: getUserFromString
  };
}

const codeLetters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function generateCode(g) {
  let code = '';
  for (let i = 0; i < 10; i++) {
    code += codeLetters[g.intBetween(0, codeLetters.length-1)];
  }
  return code;
}