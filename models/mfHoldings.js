const mongoose = require('mongoose');
// const mongooseAsyncHooks = require('@mongoosejs/async-hooks');

const collection = 'mfHoldings';

const mfHoldingSchema = new mongoose.Schema(
  {
    mfUserId: { type: mongoose.Schema.Types.ObjectId, index: true, unique: true },
    mfRaw: Object,
    fromDate: Date,
    toDate: Date,
    snapshotDate: Date,
    summary: [Object],
    transactions: [Object],
    userInfo: Object,
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } }
);

// mfHoldingSchema.plugin(mongooseAsyncHooks);

module.exports = mongoose.model('MfHolding', mfHoldingSchema, collection);
