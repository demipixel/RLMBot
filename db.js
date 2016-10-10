const gen = require('random-seed');

module.exports = function(db) {

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

  return {
    getUser: getUser,
    getUserRedditKey: getUserRedditKey,
    getUserReddit: getUserReddit
  };
}

const codeLetters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function generateCode(g) {
  let code = '';
  for (var i = 0; i < 10; i++) {
    code += codeLetters[g.intBetween(0, codeLetters.length-1)];
  }
  return code;
}