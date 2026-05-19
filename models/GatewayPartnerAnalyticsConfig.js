const mongoose = require('mongoose');

const { Schema } = mongoose;
const collection = 'gatewayPartnerAnalyticsConfigs';

const gatewayPartnerAnalyticsConfigSchema = new Schema(
  {
    // Partner identifier (gateway name) - unique index
    partnerId: {
      type: String,
      required: true,
      index: { unique: true },
      lowercase: true,
    },

    // Master switch for this partner
    enabled: {
      type: Boolean,
      default: false,
    },

    // List of enabled event names for this partner
    // e.g., ["Gateway Transaction Triggered", "Subscription Flow Triggered"]
    enabledEvents: {
      type: [String],
      default: [],
    },

    // List of enabled field names for this partner (applies to all enabled events)
    // e.g., ["orderType", "scid", "smallcaseName", "brokerName"]
    enabledFields: {
      type: [String],
      default: [],
    },

    // Version for optimistic locking - auto-incremented on update
    version: {
      type: Number,
      default: 1,
    },
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  }
);

// Index for listing enabled partners (future use)
gatewayPartnerAnalyticsConfigSchema.index({ enabled: 1 });

module.exports = mongoose.model(
  'GatewayPartnerAnalyticsConfig',
  gatewayPartnerAnalyticsConfigSchema,
  collection
);
