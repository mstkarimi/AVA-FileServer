import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('role');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;

export type Role = 'admin' | 'viewer';
export type ShareType = 'file' | 'folder';

export interface FileEntry {
  name: string;
  type: 'file' | 'dir';
  size: number;
  modified: number;
  shareUrl?: string;
}

export interface Share {
  id: number;
  hash: string;
  filePath: string;
  type: ShareType;
  url: string;
  createdAt: number;
  downloadCount: number;
  lastAccessedAt: number | null;
}

export interface User {
  id: number;
  username: string;
  role: Role;
  createdAt: number;
  permissions: string[];
}

export interface SearchResult {
  path: string;
  name: string;
  type: 'file' | 'dir';
  size: number;
  modified: number;
}

export interface BulkShareItem {
  sourcePath: string;
  id?: number;
  hash?: string;
  url?: string;
  type?: ShareType;
  error?: string;
}
