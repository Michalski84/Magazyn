// Współdzielony stan modułu przesyłek (lista, edytowana przesyłka, wybrane okna).
let shipments = [];
let currentSignatureId = null;
let renderShipmentList = () => {};
let reloadShipmentList = async () => {};

let editId = null;
let editVersion = null;
let currentNotesId = null;
