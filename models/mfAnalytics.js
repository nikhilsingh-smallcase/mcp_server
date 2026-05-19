const mongoose = require('mongoose');
// const mongooseAsyncHooks = require('@mongoosejs/async-hooks');

const collection = 'mfAnalytics';
const mfAnalyticSchema = new mongoose.Schema(
  {
    requestId: { type: String, index: true },
    gateway: { type: String, index: true },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } }
);

// mfAnalyticSchema.plugin(mongooseAsyncHooks);

module.exports = mongoose.model('MfAnalytic', mfAnalyticSchema, collection);
