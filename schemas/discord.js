
module.exports = function(mongoose) {
  var Schema = mongoose.Schema;

  var discordSchema = new Schema({
    discord: String,
    redditKey: String,
    reddit: String
  });
  
  return mongoose.model('discord', discordSchema);
}