const mongoose = require("mongoose");

const OrderSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true }, // orderId (external_id enviado à NexusPag)
  courseId: String,
  courseName: String,
  amount: Number,
  studentEmail: { type: String, lowercase: true, trim: true },
  studentName: String,
  status: { type: String, enum: ["pending", "paid", "expired", "refused"], default: "pending" },
  chargeId: String, // id da transação na NexusPag
  txid: String,
  pixCode: String,
  expiresAt: Date,
  createdAt: { type: Date, default: Date.now },
  paidAt: Date
});

module.exports = mongoose.model("Order", OrderSchema);
