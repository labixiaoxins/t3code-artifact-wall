/** keyCode 229 covers browsers that end composition before the candidate-confirming keydown. */
export function isCompositionKey(event: {
  readonly nativeEvent: { readonly isComposing: boolean };
  readonly keyCode: number;
}) {
  return event.nativeEvent.isComposing || event.keyCode === 229;
}
