
module.exports = function(mongoose) {
  var Schema = mongoose.Schema;

  var banSchema = new Schema({
    to: String,
    from: String,
    date: { type: Date, default: Date.now }, // Ban start
    endDate: Date,
    length: Number, // In minutes seconds
    reason: String,

    ended: { type: Boolean, default: false },
    cancelDate: Date,
    cancelFrom: String,
    cancelReason: String
  });
  
  return mongoose.model('ban', banSchema);
}