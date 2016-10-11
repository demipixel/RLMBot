
module.exports = function(mongoose) {
  var Schema = mongoose.Schema;

  var redditSchema = new Schema({
    reddit: String,
    addedBy: String,
    date: { type: Date, default: Date.now }
  });
  
  return mongoose.model('reddit', redditSchema);
}