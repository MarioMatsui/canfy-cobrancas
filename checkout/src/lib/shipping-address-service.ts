import type { ShippingAddressInput, ShippingAddressPayload } from './types';

export type AddressField = keyof ShippingAddressInput;
export type AddressErrors = Partial<Record<AddressField, string>>;

const BRAZIL_STATES = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]);

export const ADDRESS_PERSISTENCE_AVAILABLE = false;

export function validateShippingAddress(input: ShippingAddressInput): AddressErrors {
  const errors: AddressErrors = {};
  const phone = input.recipientPhone.replace(/\D/g, '');
  const postalCode = input.postalCode.replace(/\D/g, '');
  const state = input.state.trim().toUpperCase();

  if (input.recipientName.trim().length < 2) {
    errors.recipientName = 'Informe o nome de quem receberá o pedido.';
  }
  if (phone.length < 10 || phone.length > 11) {
    errors.recipientPhone = 'Informe um telefone com DDD.';
  }
  if (postalCode.length !== 8) {
    errors.postalCode = 'Informe um CEP com 8 dígitos.';
  }
  if (!input.street.trim()) errors.street = 'Informe a rua ou avenida.';
  if (!input.number.trim()) errors.number = 'Informe o número ou S/N.';
  if (!input.neighborhood.trim()) errors.neighborhood = 'Informe o bairro.';
  if (!input.city.trim()) errors.city = 'Informe a cidade.';
  if (!BRAZIL_STATES.has(state)) errors.state = 'Selecione uma UF válida.';

  return errors;
}

export function prepareShippingAddress(input: ShippingAddressInput): ShippingAddressPayload {
  return {
    recipientName: input.recipientName.trim(),
    recipientPhone: input.recipientPhone.replace(/\D/g, ''),
    postalCode: input.postalCode.replace(/\D/g, ''),
    street: input.street.trim(),
    number: input.number.trim(),
    ...(input.complement.trim() ? { complement: input.complement.trim() } : {}),
    neighborhood: input.neighborhood.trim(),
    city: input.city.trim(),
    state: input.state.trim().toUpperCase(),
    country: 'BR',
    ...(input.reference.trim() ? { reference: input.reference.trim() } : {}),
  };
}

/**
 * Ponto único de integração futura. O backend atual não possui um endpoint
 * público token-scoped para persistir ShippingAddress, então esta função não
 * faz rede e não inventa uma rota.
 */
export async function persistShippingAddress(
  _publicToken: string,
  _address: ShippingAddressPayload,
): Promise<{ ok: false; reason: 'NOT_AVAILABLE' }> {
  return { ok: false, reason: 'NOT_AVAILABLE' };
}
