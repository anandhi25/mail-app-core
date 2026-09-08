import axios from 'axios';

const api = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

// Axios Request Interceptor to dynamically attach the Sanctum Bearer token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Axios Response Interceptor to handle 401 Unauthorized (e.g., token expired)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Clear token and redirect to login
      localStorage.removeItem('auth_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const imapApi = {
  getFolders: () => api.get('/webmail/folders').then(res => res.data),
  getMessages: (folder: string, page = 1) =>
    api.get('/webmail/messages', { params: { folder, page } }).then(res => res.data),
  getMessageDetail: (folder: string, uid: number) =>
    api.get(`/webmail/messages/${uid}`, { params: { folder } }).then(res => res.data),
  deleteMessage: (folder: string, uid: number) =>
    api.delete(`/webmail/messages/${uid}`, { params: { folder } }).then(res => res.data),
  bulkDelete: (folder: string, uids: number[]) =>
    api.delete('/webmail/messages', { data: { folder, uids } }).then(res => res.data),
};

export const webmailProfileApi = {
  getProfile: () => api.get("/webmail/profile").then(res => res.data),
  updateProfile: (data: any) => api.put("/webmail/profile", data).then(res => res.data),
};

export const smtpApi = {
  getDrafts: () => api.get('/webmail/drafts').then(res => res.data),
  saveDraft: (data: any) => api.post('/webmail/drafts', data).then(res => res.data),
  deleteDraft: (id: number) => api.delete(`/webmail/drafts/${id}`).then(res => res.data),
  sendEmail: (data: any) => api.post('/webmail/send', data).then(res => res.data),
};

export const adminApi = {
  // Domains
  getDomains: () => api.get('/admin/domains').then(res => res.data),
  createDomain: (data: any) => api.post('/admin/domains', data).then(res => res.data),
  deleteDomain: (id: number) => api.delete(`/admin/domains/${id}`).then(res => res.data),

  // Mail Users
  getMailUsers: (domainId: number) => api.get(`/admin/domains/${domainId}/users`).then(res => res.data),
  createMailUser: (domainId: number, data: any) => api.post(`/admin/domains/${domainId}/users`, data).then(res => res.data),
  deleteMailUser: (id: number) => api.delete(`/admin/users/${id}`).then(res => res.data),
  triggerSync: (userId: number, data: any) => api.post(`/admin/users/${userId}/sync`, data).then(res => res.data),

  // Server Settings
  getConfigs: () => api.get('/admin/config').then(res => res.data),
  updateConfigs: (configs: any[]) => api.put('/admin/config', { configs }).then(res => res.data),
};

export default api;
