const mongoose = require('mongoose');

const collection = 'userApplications';
const constants = {
  status: {
    INITIALIZE: 'INITIALIZE',
    DETAILS_REGISTER: 'DETAILS_REGISTER',
    BROKER_REGISTER: 'BROKER_REGISTER',
    SUBMITTED: 'SUBMITTED',
    PROCESSING: 'PROCESSING',
    COMPLETED: 'COMPLETED',
    VERIFICATION: 'VERIFICATION',
  },
};

function convert10Digit(phonenumber) {
  if (phonenumber) {
    // because the duplication phone identifier id dup : 0/91/8175942750dup1
    const ind = phonenumber.indexOf('d');
    if (ind >= 0) {
      phonenumber = phonenumber.slice(0, ind);
    }
  }
  return phonenumber;
}

const userApplicationSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      lowercase: true,
      unique: true,
      index: {
        unique: true,
      },
    },
    meta: {
      name: String,
      phone: { type: String, unique: true, get: convert10Digit },
      dateCreated: {
        type: Date,
        default: Date.now,
      },
      pan: String,
      location: String,
      pincode: String,
      deviceType: String,
      isRetargeted: Boolean,
      utm: {
        source: String,
        medium: String,
        campaign: String,
        content: String,
        term: String,
        brokerDistributionVariant: String,
      },
      recommendedBroker: {
        broker: String,
        selected: Boolean,
      },
    },
    dateConverted: { type: Date },
    refCode: { type: String, index: true },
    mobileVerified: { type: Boolean },
    refId: { type: String, index: true },
    refHash: String,
    respMessage: String,
    channel: String,
    accOpeningUrl: String,
    status: {
      type: String,
      enum: constants.status,
    },
    step: {
      type: String,
      enum: constants.step,
    },
    flow: String,
    broker: String,
    source: { type: String, index: true },
    followupCount: {
      type: Number,
      default: 0,
    },
    leadSentBySmallcase: Boolean,
    stageId: String,
    stageMap: [
      { _id: false, stage: String, date: Date, source: String, key: String },
    ],
    accOpeningMethod: {
      type: String,
      enum: ['offline', 'online'],
    },
  },
  {
    timestamps: {
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
    },
  }
);
userApplicationSchema.index('updatedAt');
userApplicationSchema.index('createdAt');
userApplicationSchema.index(
  { email: 1 },
  {
    name: 'email_1_partial',
    partialFilterExpression: { email: { $exists: true } },
  }
);
userApplicationSchema.index(
  { 'meta.phone': 1 },
  {
    name: 'meta.phone_1_partial',
    partialFilterExpression: { 'meta.phone': { $exists: true } },
  }
);

const UserApplication = mongoose.model(
  'UserApplication',
  userApplicationSchema,
  collection
);
module.exports = UserApplication;
