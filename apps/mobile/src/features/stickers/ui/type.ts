import { typeStyleOf, type TypeVariant } from '../../../ui/type/styles';

/**
 * Room for a hand or display face's tall letters and Vietnamese marks: its line at least 1.3
 * times its size.
 */
export const roomy = (variant: TypeVariant): { lineHeight: number } => ({
  lineHeight: Math.ceil(typeStyleOf(variant).size * 1.3),
});
