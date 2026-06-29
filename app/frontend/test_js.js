const data = { invoice: { '_TOTAL_PAGADO_REAL': 0.0, 'TOTAL PAGADO': 166081.68 } };
const totalPagadoReal = data?.invoice?.['_TOTAL_PAGADO_REAL'] ?? data?.invoice?.['TOTAL PAGADO'] ?? 0;
console.log("totalPagadoReal:", totalPagadoReal);

// What if it is missing?
const data2 = { invoice: { 'TOTAL PAGADO': 166081.68 } };
const totalPagadoReal2 = data2?.invoice?.['_TOTAL_PAGADO_REAL'] ?? data2?.invoice?.['TOTAL PAGADO'] ?? 0;
console.log("totalPagadoReal2:", totalPagadoReal2);
