const mongoose = require('mongoose');
// const mongooseAsyncHooks = require('@mongoosejs/async-hooks');

const collection = 'mfPartnerConfig';
const mfPartnerConfigSchema = new mongoose.Schema(
  {
    // connected to publisher collection if smt is enabled
    name: { type: String, index: true, lowercase: true },
    clientId: String,
    clientSecret: String,
    username: String,
    password: String,
    encryptionDecryptionKey: String,
    privateKey: { type: Map, of: String },
    publicKey: { type: Map, of: String },
    accessToken: String,
    gateway: String,
    flow: { type: String, enum: ['lending', 'wealth'], default: 'wealth' },
    postbackUrl: {
      mfHoldings: { type: String, default: '' },
    },
    flags: {
      storeMfData: { type: Boolean, default: false },
    },
    // v2 MFC flow fields
    ssrEncryptionKey: String, // 32-byte key for encrypting SSR payload
    v2RedirectUrl: String, // Partner callback URL after MFC flow
    autoDetectQR: { type: Boolean, default: false }, // Flag for frontend QR handling
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } }
);

// Compound unique index for gateway + flow combination
mfPartnerConfigSchema.index({ gateway: 1, flow: 1 }, { unique: true });

// mfPartnerConfigSchema.plugin(mongooseAsyncHooks);

module.exports = mongoose.model(
  'MfPartnerConfig',
  mfPartnerConfigSchema,
  collection
);
