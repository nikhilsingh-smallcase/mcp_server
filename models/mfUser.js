const mongoose = require('mongoose');
// const mongooseAsyncHooks = require('@mongoosejs/async-hooks');

const collection = 'mfUsers';
const mfUserSchema = new mongoose.Schema(
  {
    // connected to publisher collection if smt is enabled
    pan: { type: String, index: true },
    vendor: String,
    phone: [String],
    email: [String],
    lastUsedPhone: String,
    lastUsedEmail: String,
    gateway: { type: String, index: true },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } }
);

// mfUserSchema.plugin(mongooseAsyncHooks);

module.exports = mongoose.model('MfUser', mfUserSchema, collection);
