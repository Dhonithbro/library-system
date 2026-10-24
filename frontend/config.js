// Same-server deployment: leave empty.
// If frontend is opened via file:// or separately, connect to localhost:5000
window.API_BASE = window.location.protocol === 'file:' ? 'http://localhost:5000' : '';

