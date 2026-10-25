-- Bizum como método de pago (vía Stripe Checkout)
alter type public.payment_method add value if not exists 'bizum';
