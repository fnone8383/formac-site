const mongoose = require("mongoose");

const EnrollmentSchema = new mongoose.Schema({
  id: { type: String, required: true },
  courseId: { type: String, required: true },
  courseName: String,
  amount: Number,
  orderId: String,
  enrolledAt: { type: Date, default: Date.now },
  progress: { type: Map, of: Boolean, default: {} }, // { "0": true, "1": false, ... }
  completed: { type: Boolean, default: false },
  completedAt: Date,
  certificateIssued: { type: Boolean, default: false },
  certificateCode: String,
  rating: Number,
  reviewText: String
}, { _id: false });

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  cpf: String,
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: String,
  passwordHash: { type: String, required: true },
  enrollments: { type: [EnrollmentSchema], default: [] },
  createdAt: { type: Date, default: Date.now }
});

// Nunca deixar o hash da senha vazar em respostas JSON por acidente.
UserSchema.methods.toSafeJSON = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model("User", UserSchema);
