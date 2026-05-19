const mongoose = require('mongoose');
// const mongooseAsyncHooks = require('@mongoosejs/async-hooks');
const { accountTypes } = require('../lib/constants/gatewayTypes');

const { Schema } = mongoose;
const collection = 'gatewayAccounts';
const gatewayAccountSchema = new Schema(
  {
    accountType: {
      type: String,
      enum: [...Object.values(accountTypes)],
      required: true,
    },
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    platform: { type: String },
    platformId: { type: String },
    meta: {
      phoneCountryCode: { type: String },
    },
  },
  { timestamps: true }
);

gatewayAccountSchema.index({ accountType: 1, accountId: 1 }, { unique: true });

// gatewayAccountSchema.plugin(mongooseAsyncHooks);

module.exports = mongoose.model(
  'GatewayAccount',
  gatewayAccountSchema,
  collection
);
