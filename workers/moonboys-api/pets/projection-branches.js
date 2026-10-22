// Projection branches can initialize or repair durable rows. A failed sibling
// must not end the HTTP request while those writes are still in flight.
export async function settlePetProjectionBranches(branches) {
  const results = await Promise.allSettled(branches);
  const failure = results.find(result => result.status === 'rejected');
  if (failure) throw failure.reason;
  return results.map(result => result.value);
}
