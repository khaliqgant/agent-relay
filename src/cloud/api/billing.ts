/**
 * Agent Relay Cloud - Billing API
 *
 * REST API for subscription and billing management.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { getBillingService, getAllPlans, getPlan, comparePlans } from '../billing';
import type { SubscriptionTier } from '../billing/types';
import { getConfig } from '../config';

// Extend express session with user info
declare module 'express-session' {
  interface SessionData {
    user?: {
      id: string;
      email: string;
      name?: string;
      stripeCustomerId?: string;
    };
  }
}

export const billingRouter = Router();

/**
 * Middleware to require authentication
 */
function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  next();
}

/**
 * GET /api/billing/plans
 * Get all available billing plans
 */
billingRouter.get('/plans', (req, res) => {
  const plans = getAllPlans();

  // Add publishable key for frontend
  const config = getConfig();

  res.json({
    plans,
    publishableKey: config.stripe.publishableKey,
  });
});

/**
 * GET /api/billing/plans/:tier
 * Get a specific plan by tier
 */
billingRouter.get('/plans/:tier', (req, res) => {
  const { tier } = req.params;

  try {
    const plan = getPlan(tier as SubscriptionTier);
    res.json({ plan });
  } catch {
    res.status(404).json({ error: 'Plan not found' });
  }
});

/**
 * GET /api/billing/compare
 * Compare two plans
 */
billingRouter.get('/compare', (req, res) => {
  const { from, to } = req.query;

  if (!from || !to) {
    res.status(400).json({ error: 'Missing from or to parameter' });
    return;
  }

  try {
    const comparison = comparePlans(from as SubscriptionTier, to as SubscriptionTier);
    res.json({ comparison });
  } catch {
    res.status(400).json({ error: 'Invalid plan tier' });
  }
});

/**
 * GET /api/billing/subscription
 * Get current user's subscription status
 */
billingRouter.get('/subscription', requireAuth, async (req, res) => {
  const user = req.session!.user!;
  const billing = getBillingService();

  try {
    // Get or create Stripe customer
    const customerId = user.stripeCustomerId ||
      await billing.getOrCreateCustomer(user.id, user.email, user.name);

    // Save customer ID to session if newly created
    if (!user.stripeCustomerId) {
      req.session!.user!.stripeCustomerId = customerId;
    }

    // Get customer details
    const customer = await billing.getCustomer(customerId);

    if (!customer) {
      res.json({
        tier: 'free',
        subscription: null,
        customer: null,
      });
      return;
    }

    res.json({
      tier: customer.subscription?.tier || 'free',
      subscription: customer.subscription,
      customer: {
        id: customer.id,
        email: customer.email,
        name: customer.name,
        paymentMethods: customer.paymentMethods,
        invoices: customer.invoices,
      },
    });
  } catch (error) {
    console.error('Failed to get subscription:', error);
    res.status(500).json({ error: 'Failed to get subscription status' });
  }
});

/**
 * POST /api/billing/checkout
 * Create a checkout session for subscription
 */
billingRouter.post('/checkout', requireAuth, async (req, res) => {
  const user = req.session!.user!;
  const { tier, interval = 'month' } = req.body;

  if (!tier || !['pro', 'team', 'enterprise'].includes(tier)) {
    res.status(400).json({ error: 'Invalid tier' });
    return;
  }

  if (!['month', 'year'].includes(interval)) {
    res.status(400).json({ error: 'Invalid billing interval' });
    return;
  }

  const billing = getBillingService();
  const config = getConfig();

  try {
    // Get or create customer
    const customerId = user.stripeCustomerId ||
      await billing.getOrCreateCustomer(user.id, user.email, user.name);

    // Save customer ID to session
    if (!user.stripeCustomerId) {
      req.session!.user!.stripeCustomerId = customerId;
    }

    // Create checkout session
    const session = await billing.createCheckoutSession(
      customerId,
      tier as SubscriptionTier,
      interval as 'month' | 'year',
      `${config.publicUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      `${config.publicUrl}/billing/canceled`
    );

    res.json(session);
  } catch (error) {
    console.error('Failed to create checkout session:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

/**
 * POST /api/billing/portal
 * Create a billing portal session for managing subscription
 */
billingRouter.post('/portal', requireAuth, async (req, res) => {
  const user = req.session!.user!;

  if (!user.stripeCustomerId) {
    res.status(400).json({ error: 'No billing account found' });
    return;
  }

  const billing = getBillingService();
  const config = getConfig();

  try {
    const session = await billing.createPortalSession(
      user.stripeCustomerId,
      `${config.publicUrl}/billing`
    );

    res.json(session);
  } catch (error) {
    console.error('Failed to create portal session:', error);
    res.status(500).json({ error: 'Failed to create billing portal' });
  }
});

/**
 * POST /api/billing/change
 * Change subscription tier
 */
billingRouter.post('/change', requireAuth, async (req, res) => {
  const user = req.session!.user!;
  const { tier, interval = 'month' } = req.body;

  if (!tier || !['free', 'pro', 'team', 'enterprise'].includes(tier)) {
    res.status(400).json({ error: 'Invalid tier' });
    return;
  }

  if (!user.stripeCustomerId) {
    res.status(400).json({ error: 'No billing account found' });
    return;
  }

  const billing = getBillingService();

  try {
    // Get current subscription
    const customer = await billing.getCustomer(user.stripeCustomerId);

    if (!customer?.subscription) {
      res.status(400).json({ error: 'No active subscription' });
      return;
    }

    // Handle downgrade to free (cancel)
    if (tier === 'free') {
      const subscription = await billing.cancelSubscription(
        customer.subscription.stripeSubscriptionId
      );
      res.json({ subscription, message: 'Subscription will be canceled at period end' });
      return;
    }

    // Change subscription
    const subscription = await billing.changeSubscription(
      customer.subscription.stripeSubscriptionId,
      tier as SubscriptionTier,
      interval as 'month' | 'year'
    );

    res.json({ subscription });
  } catch (error) {
    console.error('Failed to change subscription:', error);
    res.status(500).json({ error: 'Failed to change subscription' });
  }
});

/**
 * POST /api/billing/cancel
 * Cancel subscription at period end
 */
billingRouter.post('/cancel', requireAuth, async (req, res) => {
  const user = req.session!.user!;

  if (!user.stripeCustomerId) {
    res.status(400).json({ error: 'No billing account found' });
    return;
  }

  const billing = getBillingService();

  try {
    const customer = await billing.getCustomer(user.stripeCustomerId);

    if (!customer?.subscription) {
      res.status(400).json({ error: 'No active subscription' });
      return;
    }

    const subscription = await billing.cancelSubscription(
      customer.subscription.stripeSubscriptionId
    );

    res.json({
      subscription,
      message: `Subscription will be canceled on ${subscription.currentPeriodEnd.toLocaleDateString()}`,
    });
  } catch (error) {
    console.error('Failed to cancel subscription:', error);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

/**
 * POST /api/billing/resume
 * Resume a canceled subscription
 */
billingRouter.post('/resume', requireAuth, async (req, res) => {
  const user = req.session!.user!;

  if (!user.stripeCustomerId) {
    res.status(400).json({ error: 'No billing account found' });
    return;
  }

  const billing = getBillingService();

  try {
    const customer = await billing.getCustomer(user.stripeCustomerId);

    if (!customer?.subscription) {
      res.status(400).json({ error: 'No subscription to resume' });
      return;
    }

    if (!customer.subscription.cancelAtPeriodEnd) {
      res.status(400).json({ error: 'Subscription is not set to cancel' });
      return;
    }

    const subscription = await billing.resumeSubscription(
      customer.subscription.stripeSubscriptionId
    );

    res.json({ subscription, message: 'Subscription resumed' });
  } catch (error) {
    console.error('Failed to resume subscription:', error);
    res.status(500).json({ error: 'Failed to resume subscription' });
  }
});

/**
 * GET /api/billing/invoices
 * Get user's invoices
 */
billingRouter.get('/invoices', requireAuth, async (req, res) => {
  const user = req.session!.user!;

  if (!user.stripeCustomerId) {
    res.json({ invoices: [] });
    return;
  }

  const billing = getBillingService();

  try {
    const customer = await billing.getCustomer(user.stripeCustomerId);
    res.json({ invoices: customer?.invoices || [] });
  } catch (error) {
    console.error('Failed to get invoices:', error);
    res.status(500).json({ error: 'Failed to get invoices' });
  }
});

/**
 * GET /api/billing/upcoming
 * Get upcoming invoice preview
 */
billingRouter.get('/upcoming', requireAuth, async (req, res) => {
  const user = req.session!.user!;

  if (!user.stripeCustomerId) {
    res.json({ invoice: null });
    return;
  }

  const billing = getBillingService();

  try {
    const invoice = await billing.getUpcomingInvoice(user.stripeCustomerId);
    res.json({ invoice });
  } catch (error) {
    console.error('Failed to get upcoming invoice:', error);
    res.status(500).json({ error: 'Failed to get upcoming invoice' });
  }
});

/**
 * POST /api/billing/webhook
 * Handle Stripe webhooks
 */
billingRouter.post(
  '/webhook',
  // Use raw body for webhook signature verification
  (req, res, next) => {
    if (req.headers['content-type'] === 'application/json') {
      next();
    } else {
      next();
    }
  },
  async (req, res) => {
    const sig = req.headers['stripe-signature'];

    if (!sig) {
      res.status(400).json({ error: 'Missing signature' });
      return;
    }

    const billing = getBillingService();

    try {
      // Get raw body
      const rawBody = JSON.stringify(req.body);

      // Verify and parse event
      const event = billing.verifyWebhookSignature(rawBody, sig as string);

      // Process the event
      const billingEvent = await billing.processWebhookEvent(event);

      // Log for debugging
      console.log('Processed billing event:', {
        id: billingEvent.id,
        type: billingEvent.type,
        userId: billingEvent.userId,
      });

      // Handle specific events
      switch (billingEvent.type) {
        case 'subscription.created':
        case 'subscription.updated':
          // Update user's subscription in database
          // This would integrate with your user/database layer
          console.log('Subscription updated for user:', billingEvent.userId);
          break;

        case 'subscription.canceled':
          console.log('Subscription canceled for user:', billingEvent.userId);
          break;

        case 'invoice.payment_failed':
          // Notify user of failed payment
          console.log('Payment failed for user:', billingEvent.userId);
          break;
      }

      res.json({ received: true });
    } catch (error) {
      console.error('Webhook error:', error);
      res.status(400).json({ error: 'Webhook verification failed' });
    }
  }
);
