import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'https://invigilation-scheme-production.up.railway.app';

const api = axios.create({
  baseURL: API_URL,
});

api.interceptors.request.use(config => {
  const token = localStorage.getItem('invigToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('invigToken');
      localStorage.removeItem('invigUser');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;

// Helpers
export const auth = {
  login: (email, password) => api.post('/api/auth/login', { email, password }),
  register: (name, email, password) => api.post('/api/auth/register', { name, email, password }),
  me: () => api.get('/api/auth/me'),
  users: () => api.get('/api/auth/users'),
  updateRole: (id, role) => api.patch(`/api/auth/users/${id}/role`, { role }),
  deleteUser: (id) => api.delete(`/api/auth/users/${id}`),
};

export const teachers = {
  list: () => api.get('/api/teachers'),
  create: (data) => api.post('/api/teachers', data),
  update: (id, data) => api.put(`/api/teachers/${id}`, data),
  remove: (id) => api.delete(`/api/teachers/${id}`),
  bulkReplace: (items) => api.post('/api/teachers/bulk-replace', items),
};

export const attendants = {
  list: () => api.get('/api/attendants'),
  create: (data) => api.post('/api/attendants', data),
  update: (id, data) => api.put(`/api/attendants/${id}`, data),
  remove: (id) => api.delete(`/api/attendants/${id}`),
  bulkReplace: (items) => api.post('/api/attendants/bulk-replace', items),
};

export const pairs = {
  list: () => api.get('/api/pairs'),
  create: (data) => api.post('/api/pairs', data),
  update: (id, data) => api.put(`/api/pairs/${id}`, data),
  remove: (id) => api.delete(`/api/pairs/${id}`),
  bulkReplace: (items) => api.post('/api/pairs/bulk-replace', items),
};

export const venues = {
  list: () => api.get('/api/venues'),
  create: (data) => api.post('/api/venues', data),
  update: (id, data) => api.put(`/api/venues/${id}`, data),
  remove: (id) => api.delete(`/api/venues/${id}`),
  bulkReplace: (items) => api.post('/api/venues/bulk-replace', items),
};

export const exams = {
  list: () => api.get('/api/exams'),
  create: (data) => api.post('/api/exams', data),
  update: (id, data) => api.put(`/api/exams/${id}`, data),
  remove: (id) => api.delete(`/api/exams/${id}`),
  bulkReplace: (items) => api.post('/api/exams/bulk-replace', items),
};

export const config = {
  get: () => api.get('/api/config'),
  set: (key, value) => api.patch(`/api/config/${key}`, { value }),
};

export const schedule = {
  generate: () => api.get('/api/schedule/generate'),
  workload: () => api.get('/api/schedule/workload'),
};
