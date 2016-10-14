
module.exports = function(mongoose) {
  var Schema = mongoose.Schema;

  var repSchema = new Schema({
    steam: String,
    link: String
  });
  
  return mongoose.model('rep', repSchema);
}