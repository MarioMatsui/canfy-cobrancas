import { CheckoutClient } from '@/components/checkout-client';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default function PublicCheckoutPage({ params }: { params: { token: string } }) {
  return <CheckoutClient publicToken={params.token} />;
}
