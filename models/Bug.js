const mongoose = require('mongoose');
const { Schema } = mongoose;

const bugSchema = new Schema({
  title: { type: String, required: true },
  description: { type: String },
  severity: { type: String, enum: ['Low','Medium','High'], default: 'Low' },
  status: { type: String, enum: ['Open','In Progress','Closed'], default: 'Open' },
  reporter: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

module.exports = mongoose.model('Bug', bugSchema);
