/**
 * Agent Relay Cloud - Billing Plans
 *
 * Plan definitions for subscription tiers.
 */

import type { BillingPlan, SubscriptionTier } from './types';

/**
 * All available billing plans
 */
export const BILLING_PLANS: Record<SubscriptionTier, BillingPlan> = {
  free: {
    id: 'free',
    name: 'Free',
    description: 'For individuals exploring AI agent workflows',
    priceMonthly: 0,
    priceYearly: 0,
    limits: {
      maxWorkspaces: 2,
      maxAgentsPerWorkspace: 3,
      maxTeamMembers: 1,
      maxStorageGB: 1,
      maxComputeHoursPerMonth: 10,
      customDomains: false,
      prioritySupport: false,
      sla: false,
      ssoEnabled: false,
      auditLogs: false,
    },
    features: [
      'Up to 2 workspaces',
      'Up to 3 agents per workspace',
      '10 compute hours/month',
      '1 GB storage',
      'Community support',
    ],
  },

  pro: {
    id: 'pro',
    name: 'Pro',
    description: 'For professional developers and small teams',
    priceMonthly: 2900, // $29/month
    priceYearly: 29000, // $290/year (2 months free)
    stripePriceIdMonthly: process.env.STRIPE_PRO_MONTHLY_PRICE_ID,
    stripePriceIdYearly: process.env.STRIPE_PRO_YEARLY_PRICE_ID,
    limits: {
      maxWorkspaces: 10,
      maxAgentsPerWorkspace: 10,
      maxTeamMembers: 5,
      maxStorageGB: 10,
      maxComputeHoursPerMonth: 100,
      customDomains: true,
      prioritySupport: false,
      sla: false,
      ssoEnabled: false,
      auditLogs: false,
    },
    features: [
      'Up to 10 workspaces',
      'Up to 10 agents per workspace',
      '100 compute hours/month',
      '10 GB storage',
      '5 team members',
      'Custom domains',
      'Email support',
    ],
  },

  team: {
    id: 'team',
    name: 'Team',
    description: 'For growing teams with advanced needs',
    priceMonthly: 9900, // $99/month
    priceYearly: 99000, // $990/year (2 months free)
    stripePriceIdMonthly: process.env.STRIPE_TEAM_MONTHLY_PRICE_ID,
    stripePriceIdYearly: process.env.STRIPE_TEAM_YEARLY_PRICE_ID,
    limits: {
      maxWorkspaces: 50,
      maxAgentsPerWorkspace: 25,
      maxTeamMembers: 25,
      maxStorageGB: 50,
      maxComputeHoursPerMonth: 500,
      customDomains: true,
      prioritySupport: true,
      sla: false,
      ssoEnabled: false,
      auditLogs: true,
    },
    features: [
      'Up to 50 workspaces',
      'Up to 25 agents per workspace',
      '500 compute hours/month',
      '50 GB storage',
      '25 team members',
      'Custom domains',
      'Priority support',
      'Audit logs',
    ],
  },

  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'For organizations requiring dedicated support and SLAs',
    priceMonthly: 49900, // $499/month starting
    priceYearly: 499000, // $4990/year
    stripePriceIdMonthly: process.env.STRIPE_ENTERPRISE_MONTHLY_PRICE_ID,
    stripePriceIdYearly: process.env.STRIPE_ENTERPRISE_YEARLY_PRICE_ID,
    limits: {
      maxWorkspaces: -1, // unlimited
      maxAgentsPerWorkspace: -1, // unlimited
      maxTeamMembers: -1, // unlimited
      maxStorageGB: 500,
      maxComputeHoursPerMonth: -1, // unlimited
      customDomains: true,
      prioritySupport: true,
      sla: true,
      ssoEnabled: true,
      auditLogs: true,
    },
    features: [
      'Unlimited workspaces',
      'Unlimited agents',
      'Unlimited compute hours',
      '500 GB storage',
      'Unlimited team members',
      'Custom domains',
      'Priority support with SLA',
      'SSO/SAML integration',
      'Audit logs & compliance',
      'Dedicated account manager',
    ],
  },
};

/**
 * Get plan by ID
 */
export function getPlan(tier: SubscriptionTier): BillingPlan {
  return BILLING_PLANS[tier];
}

/**
 * Get all plans as array
 */
export function getAllPlans(): BillingPlan[] {
  return Object.values(BILLING_PLANS);
}

/**
 * Check if a limit is within plan bounds
 * Returns true if the value is within limits (-1 means unlimited)
 */
export function isWithinLimit(limit: number, current: number): boolean {
  if (limit === -1) return true; // unlimited
  return current < limit;
}

/**
 * Get the next tier upgrade from current
 */
export function getUpgradeTier(current: SubscriptionTier): SubscriptionTier | null {
  const tiers: SubscriptionTier[] = ['free', 'pro', 'team', 'enterprise'];
  const currentIndex = tiers.indexOf(current);
  if (currentIndex === -1 || currentIndex >= tiers.length - 1) {
    return null;
  }
  return tiers[currentIndex + 1];
}

/**
 * Format price for display
 */
export function formatPrice(cents: number): string {
  if (cents === 0) return 'Free';
  return `$${(cents / 100).toFixed(0)}`;
}

/**
 * Get plan limits comparison
 */
export function comparePlans(from: SubscriptionTier, to: SubscriptionTier): {
  upgrades: string[];
  downgrades: string[];
} {
  const fromPlan = BILLING_PLANS[from];
  const toPlan = BILLING_PLANS[to];

  const upgrades: string[] = [];
  const downgrades: string[] = [];

  // Compare limits
  const compareLimit = (name: string, fromVal: number, toVal: number) => {
    if (toVal === -1 && fromVal !== -1) {
      upgrades.push(`Unlimited ${name}`);
    } else if (fromVal === -1 && toVal !== -1) {
      downgrades.push(`${name} limited to ${toVal}`);
    } else if (toVal > fromVal) {
      upgrades.push(`${name}: ${fromVal} -> ${toVal}`);
    } else if (toVal < fromVal) {
      downgrades.push(`${name}: ${fromVal} -> ${toVal}`);
    }
  };

  compareLimit('workspaces', fromPlan.limits.maxWorkspaces, toPlan.limits.maxWorkspaces);
  compareLimit('agents per workspace', fromPlan.limits.maxAgentsPerWorkspace, toPlan.limits.maxAgentsPerWorkspace);
  compareLimit('team members', fromPlan.limits.maxTeamMembers, toPlan.limits.maxTeamMembers);
  compareLimit('storage GB', fromPlan.limits.maxStorageGB, toPlan.limits.maxStorageGB);
  compareLimit('compute hours', fromPlan.limits.maxComputeHoursPerMonth, toPlan.limits.maxComputeHoursPerMonth);

  // Compare boolean features
  if (toPlan.limits.customDomains && !fromPlan.limits.customDomains) {
    upgrades.push('Custom domains');
  } else if (!toPlan.limits.customDomains && fromPlan.limits.customDomains) {
    downgrades.push('Custom domains');
  }

  if (toPlan.limits.prioritySupport && !fromPlan.limits.prioritySupport) {
    upgrades.push('Priority support');
  } else if (!toPlan.limits.prioritySupport && fromPlan.limits.prioritySupport) {
    downgrades.push('Priority support');
  }

  if (toPlan.limits.sla && !fromPlan.limits.sla) {
    upgrades.push('SLA');
  } else if (!toPlan.limits.sla && fromPlan.limits.sla) {
    downgrades.push('SLA');
  }

  if (toPlan.limits.ssoEnabled && !fromPlan.limits.ssoEnabled) {
    upgrades.push('SSO/SAML');
  } else if (!toPlan.limits.ssoEnabled && fromPlan.limits.ssoEnabled) {
    downgrades.push('SSO/SAML');
  }

  if (toPlan.limits.auditLogs && !fromPlan.limits.auditLogs) {
    upgrades.push('Audit logs');
  } else if (!toPlan.limits.auditLogs && fromPlan.limits.auditLogs) {
    downgrades.push('Audit logs');
  }

  return { upgrades, downgrades };
}
