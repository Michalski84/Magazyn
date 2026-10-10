const MAX_REGISTER_NUMBER = 9_223_372_036_854_775_807n;

function formatRegisterNumber(sequence, year) {
  return `${String(sequence).padStart(3, "0")}/${year}`;
}

function parseRegisterNumber(value) {
  if (typeof value !== "string") {
    throw new Error("Numer ID musi mieć format numer/rocznik, np. 001/2026.");
  }

  const match = /^(\d+)\/(\d{4})$/.exec(value.trim());
  if (!match) {
    throw new Error("Numer ID musi mieć format numer/rocznik, np. 001/2026.");
  }

  const normalizedSequence = match[1].replace(/^0+(?=\d)/, "");
  if (normalizedSequence.length > 19) {
    throw new Error("Numer ID musi zawierać dodatni numer mieszczący się w limicie bazy.");
  }
  const sequence = BigInt(normalizedSequence);
  if (sequence < 1n || sequence > MAX_REGISTER_NUMBER) {
    throw new Error("Numer ID musi zawierać dodatni numer mieszczący się w limicie bazy.");
  }

  const year = Number(match[2]);
  if (year < 1) {
    throw new Error("Rocznik Numeru ID musi być większy od zera.");
  }

  return {
    sequence: sequence.toString(),
    year,
    value: formatRegisterNumber(sequence, year)
  };
}

module.exports = { formatRegisterNumber, parseRegisterNumber };
