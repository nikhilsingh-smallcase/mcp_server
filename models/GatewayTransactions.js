const mongoose = require('mongoose');
// const mongooseAsyncHooks = require('@mongoosejs/async-hooks');
const gatewayConstant = require('../lib/constants');
const orderConstant = require('../lib/constants/order');
const {
  assetUniverse,
  transactionStatus,
  subscriptionStatus,
} = require('../lib/constants/transaction');
const { status } = require('../lib/constants/order');

const { Schema } = mongoose;
const collection = 'gatewayTransactions';

const trxRequestSchema = new Schema(
  {
    transactionId: {
      type: String,
      index: true,
      unique: true,
    },
    intent: { type: String, enum: Object.values(gatewayConstant.intents) },
    gateway: { type: String, index: true },
    authId: { type: String, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, index: true },
    mfUserId: { type: mongoose.Schema.Types.ObjectId, index: true },
    intendedActionInitiated: { type: Boolean, default: false },
    funds: Number,
    fundsUrl: String,
    sipAction: String, // create, manage or end
    imrAction: String, // create, manage or end
    signup: Boolean, // indicating if the transaction document lead to user signup. Populated in runPostBrokerLoginTasks of smallcase-api
    flags: {
      sipCreatedOrUpdated: Boolean,
      imrCreatedOrUpdated: Boolean,
      private: Boolean,
      subscribed: Boolean,
      showSubscription: Boolean,
      sessionExtended: Boolean,
      hideSubscriptionSuccessScreen: Boolean,
      isOrderRequested: Boolean,
    },
    orderConfig: {
      assetUniverse: { type: String, enum: Object.values(assetUniverse) },
      type: {
        type: String,
        enum: [
          'BUY',
          'INVESTMORE',
          'FIX',
          'MANAGE',
          'REBALANCE',
          'REBALANCE_BUY',
          'RECONCILIATION',
          'DUMMY',
          'SIP',
          'EXIT',
          'SECURITIES',
          'CANCEL',
          'NEW',
          'SIP_REPAIR',
        ],
      }, // only for SDK usage
      scid: String,
      iscid: String,
      pendingActionId: String,
      sids: [String], // Array of security IDs for MANAGE order type
      amount: Number, // valid only for buy and investmore
      name: String,
      did: String, // only for first-party integrations
      source: String,
      orders: [
        {
          _id: false,
          sid: { type: String },
          mfId: { type: String },
          type: { type: String, enum: ['BUY', 'SELL', 'SIP'] },
          exchange: { type: String, enum: ['BSE', 'NSE'] },
          quantity: Number,
          orderType: {
            type: String,
            enum: Object.values(orderConstant.orderType),
          }, // Market/Limit
          validity: {
            type: String,
            enum: Object.values(orderConstant.validity),
          },
          triggerPrice: Number,
          price: Number, // Only for limit orders
        },
      ],
      orderIds: [String],
      batchIds: [String], // updated after post order processing of any kind
      reconIds: [String], // updated after post recon processing
      mandateIds: [String],
      exitType: {
        type: String,
        enum: ['WHOLE', 'PARTIAL'],
      },
    },
    config: {
      mfJourneyId: String,
      samRefId: String,
      provider: String, // MF txn provider to decide on platform (RTA / MFU)
      orderName: String, // name of the sst order basket
      orderLogo: String, // image url of the sst order basket
      scid: String, // scid for the subscription orderconfig
      iscid: String, // iscid for the subscription orderconfig
      name: String, // smallcase name for the subscription orderconfig
      subscriptionOffer: {
        offerCode: String, // offer code to be auto applied in subscription widget
        offerPlanDuration: {
          type: String,
          enum: ['1y', '6m', '3m', '1m'],
        }, // plan duration for which offer code will be applied
      },
      isActiveSearch: Boolean, // users who arrive from the app or the website via a search
    },
    actions: {
      subscriptionStatus: {
        type: String,
        enum: Object.values(subscriptionStatus),
      },
    },
    assetConfig: {
      mfHoldings: Boolean,
      fromDate: Date,
      toDate: Date,
      redirectUrl: String,
      requestId: String, // TODO need to remove this
      clientRefNo: String, // TODO need to remove this
      casSummary: {
        requestId: String,
        clientRefNo: String,
      },
      casDetail: {
        requestId: String,
        clientRefNo: String,
      },
      // v2 flow uses casRequest instead of casDetail
      casRequest: {
        requestId: String,
        clientRefNo: String,
      },
      // v2 flow - flag indicating if QR auto-detection is enabled for the partner
      autoDetectQR: {
        type: Boolean,
        default: false,
      },
      preferredOtpMethod: {
        type: String,
        enum: ['email', 'phone'], //  field for preferred OTP method of partner
        default: 'phone',
      },
      usedOtpMethod: {
        type: String,
        enum: ['email', 'phone'], // New field for the actual OTP method used by the user
      },
      responseConfig: {
        casDetail: {
          type: Boolean,
        },
        casSummary: {
          type: Boolean,
        },
      },
      flow: {
        type: String,
        enum: ['wealth', 'lending', null],
        default: null,
      },
    },
    status: {
      type: String,
      enum: [
        transactionStatus.INITIALIZED, // when started from be-be flow
        transactionStatus.USED, // when connect flow is validated, not valid for intent = CONNECT itself
        transactionStatus.PROCESSING, // intent flow is in process, only valid for backgroud processes
        transactionStatus.COMPLETED, // switched by various services according to intent
        transactionStatus.ACTION_REQUIRED, // when action is pending on behalf of the user
        transactionStatus.ERRORED, // client side error
        transactionStatus.CANCELLED, // explicit user cancellation
        transactionStatus.EXPIRED, // by EOD job
      ],
    },
    // for SDK usage only
    error: {
      value: { type: Boolean, default: false }, // value is true for ERRORED, CANCELLED, EXPIRED
      code: Number,
      message: String,
    },
    meta: {
      // display name for a transaction
      name: String,
      broker: String,
      agent: {
        type: String,
        enum: ['android', 'ios', 'web', 'mweb'],
      },
      sdkVersion: String,
      subWidgetEncryptedData: String,
      source: {
        type: String,
        enum: ['dm'],
      },
      opener: {
        type: String,
        enum: ['CUSTOM_TAB', 'WEBVIEW'],
      },
      mfhiSkipPanInput: Boolean,
      mfhiSkipOnboardingScreen: Boolean,
    },
    userConsent: {
      consent: Boolean,
      ip: String,
      timestamp: Date,
    },
    // TODO: make it intent specific?
    expireAt: {
      type: Date,
      default() {
        return new Date(Date.now() + 300000);
      },
    },
    postbackStatus: {
      order: { type: Number, default: null },
      smtOrder: { type: Number, default: null },
      holding: { type: Number, default: null },
      mfHolding: { type: Number, default: null },
      retryAfter: {
        type: String,
        enum: [null, '15m', '24h', '48h', 'inf'],
        default: null,
        index: true,
      },
      lastTry: { type: Date, default: null },
    },
    postbackContext: {
      lastUpdates: {
        SST_ORDER_placed: {
          statusCode: { type: Number },
          lastTry: { type: Date },
          retryAfter: {
            type: String,
            enum: [null, '15m', '24h', '48h', 'inf'],
            index: true,
          },
        },
        SST_ORDER_finished: {
          statusCode: { type: Number },
          lastTry: { type: Date },
          retryAfter: {
            type: String,
            enum: [null, '15m', '24h', '48h', 'inf'],
            index: true,
          },
        },
        ORDER_placed: {
          statusCode: { type: Number },
          lastTry: { type: Date },
          retryAfter: {
            type: String,
            enum: [null, '15m', '24h', '48h', 'inf'],
            index: true,
          },
        },
        ORDER_finished: {
          statusCode: { type: Number },
          lastTry: { type: Date },
          retryAfter: {
            type: String,
            enum: [null, '15m', '24h', '48h', 'inf'],
            index: true,
          },
        },
        ORDER_errored: {
          statusCode: { type: Number },
          lastTry: { type: Date },
          retryAfter: {
            type: String,
            enum: [null, '15m', '24h', '48h', 'inf'],
            index: true,
          },
        },
      },
      history: [
        {
          statusCode: { type: Number },
          timestamp: { type: Date },
          orderStatus: { type: String, enum: status },
          _id: false,
        },
      ],
    },
    completedAt: Date,
    notes: String,
    version: {
      type: String,
      enum: ['v1', 'v2'],
      default: 'v1',
    },
    partnerContext: mongoose.Schema.Types.Mixed, // Flexible object for partner-specific data, saved as-is without validation

    // TODO: add postback info (url, payload, retries, response status code, last retry timestamp) here?
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } }
);

// trxRequestSchema.plugin(mongooseAsyncHooks);

module.exports = mongoose.model(
  'GatewayTransactions',
  trxRequestSchema,
  collection
);
