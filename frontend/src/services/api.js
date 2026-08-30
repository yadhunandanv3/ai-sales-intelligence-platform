const API_BASE = import.meta.env.VITE_API_URL || '/api';

class ApiService {
  constructor() {
    this.accessToken = localStorage.getItem('access_token');
    this.refreshToken = localStorage.getItem('refresh_token');
  }

  setTokens(accessToken, refreshToken) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    localStorage.setItem('access_token', accessToken);
    localStorage.setItem('refresh_token', refreshToken);
  }

  clearTokens() {
    this.accessToken = null;
    this.refreshToken = null;
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  }

  isAuthenticated() {
    return !!this.accessToken;
  }

  /**
   * Helper request wrapper managing authorization headers and automatic refresh rotation.
   */
  async request(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    
    // Set headers
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const config = {
      ...options,
      headers
    };

    try {
      let response = await fetch(url, config);

      // Handle token expiration
      if (response.status === 401 && this.refreshToken) {
        const refreshed = await this.rotateTokens();
        if (refreshed) {
          // Retry request with new token
          headers['Authorization'] = `Bearer ${this.accessToken}`;
          response = await fetch(url, config);
        } else {
          this.clearTokens();
          window.location.href = '/login';
          throw new Error('Session expired, please login again.');
        }
      }

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error?.message || `HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('API Request Failure:', error);
      throw error;
    }
  }

  /**
   * Rotate access tokens using the stored refresh token.
   */
  async rotateTokens() {
    try {
      const response = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ refreshToken: this.refreshToken })
      });

      if (!response.ok) return false;

      const result = await response.json();
      this.setTokens(result.data.accessToken, result.data.refreshToken);
      return true;
    } catch (error) {
      return false;
    }
  }

  // --- Auth Endpoints ---

  async login({ email, password }) {
    const result = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    this.setTokens(result.data.tokens.accessToken, result.data.tokens.refreshToken);
    return result.data;
  }

  async signup(signupData) {
    const result = await this.request('/auth/signup', {
      method: 'POST',
      body: JSON.stringify(signupData)
    });
    this.setTokens(result.data.tokens.accessToken, result.data.tokens.refreshToken);
    return result.data;
  }

  async logout() {
    try {
      if (this.refreshToken) {
        await this.request('/auth/logout', {
          method: 'POST',
          body: JSON.stringify({ refreshToken: this.refreshToken })
        });
      }
    } catch (err) {
      // Fail-safe
    } finally {
      this.clearTokens();
    }
  }

  // --- Leads Endpoints ---

  async getLeads({ page = 1, limit = 10, search = '', status = '' } = {}) {
    let query = `?page=${page}&limit=${limit}`;
    if (search) query += `&search=${encodeURIComponent(search)}`;
    if (status) query += `&status=${encodeURIComponent(status)}`;
    return this.request(`/leads${query}`);
  }

  async createLead(leadData) {
    return this.request('/leads', {
      method: 'POST',
      body: JSON.stringify(leadData)
    });
  }

  async updateLead(id, updateData) {
    return this.request(`/leads/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updateData)
    });
  }

  async deleteLead(id) {
    return this.request(`/leads/${id}`, {
      method: 'DELETE'
    });
  }

  // --- AI Intelligence Endpoints ---

  async scoreLead(id) {
    return this.request(`/leads/${id}/score`, {
      method: 'POST'
    });
  }

  async generateSummary(id) {
    return this.request(`/leads/${id}/summary`, {
      method: 'POST'
    });
  }

  async generateFollowUp(id, { tone = 'PROFESSIONAL', customInstructions = '' }) {
    return this.request(`/leads/${id}/follow-up`, {
      method: 'POST',
      body: JSON.stringify({ tone, customInstructions })
    });
  }

  // --- AI Sales Assistant Endpoints ---

  async askAssistant(message) {
    return this.request('/ai/assistant', {
      method: 'POST',
      body: JSON.stringify({ message })
    });
  }
}

export const api = new ApiService();
