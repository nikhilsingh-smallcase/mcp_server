const mongoose = require('mongoose');

// const mongooseAsyncHooks = require('@mongoosejs/async-hooks');

const { accountTypes } = require('../lib/constants/gatewayTypes');

const GatewayAccount = require('./GatewayAccount');

const { Schema } = mongoose;
const collection = 'gatewayUsers';
const gatewayUserSchema = new Schema(
  {
    gateway: String,
    // Legacy fields - kept for backward compatibility
    // account type like stock broker, mutual fund, crypto
    accountType: { type: String, enum: [...Object.values(accountTypes)] },
    accountId: { type: mongoose.Schema.Types.ObjectId, index: true },
    // TODO: define the enum for different possible values of platform
    // // This will tell which platform (kite, coindcx, coin)
    platform: { type: String },
    // This will be the broker userId
    platformId: { type: String },
    // New schema fields
    connections: [
      {
        type: {
          type: String,
          enum: [...Object.values(accountTypes)],
          required: true,
        },
        id: {
          type: mongoose.Schema.Types.ObjectId,
          required: true,
          ref: 'GatewayAccount',
          index: true,
        },
        isDefault: {
          type: Boolean,
          default: false,
        },
        _id: false,
      },
    ],
    version: { type: Number, default: 1 },
    // References to merged gateway users (for SAM/BAM merging)
    mergedWith: [{ type: mongoose.Schema.Types.ObjectId, ref: 'GatewayUser' }],
    scopes: {
      complete: { type: Boolean, default: false },
      holdings: { type: Boolean, default: false },
      orders: { type: Boolean, default: false },
      funds: { type: Boolean, default: false },
    },
    meta: {
      lastLoggedIn: { type: Date, default: Date.now },
    },
  },
  { timestamps: { createdAt: 'meta.createdAt', updatedAt: 'meta.updatedAt' } }
);

gatewayUserSchema.methods.updatedScopes = function (scopes, requiredConsents) {
  const user = this;
  if (scopes.complete) {
    user.scopes = {
      complete: true,
    };
    requiredConsents.forEach((consent) => {
      user.scopes[consent] = true;
    });
    // TODO: remove the below code once the changes are on prod and all the users are updated
  } else if (scopes.holdingsAccess && !user.scopes.holdings) {
    user.scopes = {
      holdings: true,
    };
  }
  return user.save();
};

gatewayUserSchema.methods.updateLastLogin = function () {
  const user = this;
  user.meta.lastLoggedIn = new Date();
  return user.save();
};

/**
 * Convert version 2 schema to old schema format for backward compatibility
 * Extracts values from STOCK_BROKER connection if present
 */
gatewayUserSchema.methods.toLegacyFormat = async function (defaultAccountType) {
  const userObj = this.toObject();

  // If version 2 and has connections, extract default connection data
  if (
    userObj.version === 2 &&
    userObj.connections &&
    userObj.connections.length > 0
  ) {
    let defaultConnection = null;

    if (defaultAccountType) {
      defaultConnection = userObj.connections.find(
        (conn) => conn.type === defaultAccountType
      );
      if (!defaultConnection) {
        throw new Error(
          `Default connection not found for account type ${defaultAccountType}`
        );
      }
    }

    if (!defaultConnection) {
      const withoutSamConnections = userObj.connections.filter(
        (conn) => conn.type !== accountTypes.SAM
      );
      const [primaryConnection] = withoutSamConnections;
      defaultConnection = primaryConnection;
    }

    if (defaultConnection) {
      // fetch the account from the gatewayAccount collection
      const account = await GatewayAccount.findOne({
        _id: defaultConnection.id.toString(),
      });
      if (account) {
        userObj.accountType = account.accountType;
        userObj.accountId = account.accountId;
        userObj.platform = account.platform;
        userObj.platformId = account.platformId;
      } else {
        throw new Error(
          `Account not found for connection ${defaultConnection.id}`
        );
      }
    }
  }

  // Return a hydrated mongoose document in legacy shape
  return this.model('GatewayUser').hydrate(userObj);
};

// gatewayUserSchema.plugin(mongooseAsyncHooks);

module.exports = mongoose.model('GatewayUser', gatewayUserSchema, collection);
