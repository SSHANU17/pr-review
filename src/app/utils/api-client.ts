import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import { Observable, defer, from } from 'rxjs';

/**
 * Standardized API Error for consistent error handling across the application.
 */
export class ApiError extends Error {
  public readonly statusCode?: number;
  public readonly details?: unknown;
  public readonly endpoint?: string;
  public readonly method?: string;

  constructor(message: string, statusCode?: number, details?: unknown, endpoint?: string, method?: string) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
    this.endpoint = endpoint;
    this.method = method;

    // Restore prototype chain for instanceof checks
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  public override toString(): string {
    return `[ApiError ${this.statusCode || 'NETWORK'}]: ${this.message}`;
  }
}

/**
 * Normalizes Axios errors into typed ApiError instances.
 */
function handleAxiosError(error: unknown, fallbackUrl = '', fallbackMethod = 'GET'): ApiError {
  if (axios.isAxiosError(error)) {
    const axiosErr = error as AxiosError<any>;
    const url = axiosErr.config?.url || fallbackUrl;
    const method = (axiosErr.config?.method || fallbackMethod).toUpperCase();
    const status = axiosErr.response?.status;
    const responseData = axiosErr.response?.data;

    let message = 'An unexpected error occurred while communicating with the server.';

    if (responseData) {
      if (typeof responseData === 'string') {
        message = responseData;
      } else if (responseData.error) {
        message = typeof responseData.error === 'string' ? responseData.error : responseData.error.message || message;
      } else if (responseData.message) {
        message = responseData.message;
      }
    } else if (axiosErr.message) {
      if (axiosErr.code === 'ECONNABORTED' || axiosErr.message.includes('timeout')) {
        message = `Request timeout: The server took too long to respond (${url}).`;
      } else if (axiosErr.message === 'Network Error') {
        message = 'Network Error: Unable to reach the server. Please verify your connection.';
      } else {
        message = axiosErr.message;
      }
    }

    return new ApiError(message, status, responseData, url, method);
  }

  if (error instanceof Error) {
    return new ApiError(error.message, undefined, undefined, fallbackUrl, fallbackMethod);
  }

  return new ApiError('An unknown error occurred', undefined, error, fallbackUrl, fallbackMethod);
}

/**
 * Axios HTTP Client with generic 4-operation CRUD methods (Create, Read, Update, Delete)
 * and comprehensive error normalization.
 */
class ApiClient {
  private readonly client: AxiosInstance;

  constructor(baseURL = '') {
    this.client = axios.create({
      baseURL,
      timeout: 60000,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    // Setup global response interceptor for error unwrapping
    this.client.interceptors.response.use(
      (response: AxiosResponse) => response,
      (error: AxiosError) => Promise.reject(handleAxiosError(error))
    );
  }

  /**
   * 1. CREATE (POST) - Generic operation to create resources.
   * Returns a Promise<T>
   */
  public async create<T = unknown, D = unknown>(url: string, data?: D, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response = await this.client.post<T>(url, data, config);
      return response.data;
    } catch (err) {
      throw handleAxiosError(err, url, 'POST');
    }
  }

  /**
   * 2. READ (GET) - Generic operation to retrieve resources.
   * Returns a Promise<T>
   */
  public async read<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response = await this.client.get<T>(url, config);
      return response.data;
    } catch (err) {
      throw handleAxiosError(err, url, 'GET');
    }
  }

  /**
   * 3. UPDATE (PUT / PATCH) - Generic operation to update resources.
   * Returns a Promise<T>
   */
  public async update<T = unknown, D = unknown>(
    url: string,
    data?: D,
    config?: AxiosRequestConfig,
    usePatch = false
  ): Promise<T> {
    try {
      const response = usePatch
        ? await this.client.patch<T>(url, data, config)
        : await this.client.put<T>(url, data, config);
      return response.data;
    } catch (err) {
      throw handleAxiosError(err, url, usePatch ? 'PATCH' : 'PUT');
    }
  }

  /**
   * 4. DELETE (DELETE) - Generic operation to remove resources.
   * Returns a Promise<T>
   */
  public async delete<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response = await this.client.delete<T>(url, config);
      return response.data;
    } catch (err) {
      throw handleAxiosError(err, url, 'DELETE');
    }
  }

  // ==========================================
  // RXJS OBSERVABLE-COMPATIBLE CRUD ADAPTERS
  // ==========================================

  /**
   * Create (POST) returning an RxJS Observable<T> for Angular services
   */
  public create$<T = unknown, D = unknown>(url: string, data?: D, config?: AxiosRequestConfig): Observable<T> {
    return defer(() => from(this.create<T, D>(url, data, config)));
  }

  /**
   * Read (GET) returning an RxJS Observable<T> for Angular services
   */
  public read$<T = unknown>(url: string, config?: AxiosRequestConfig): Observable<T> {
    return defer(() => from(this.read<T>(url, config)));
  }

  /**
   * Update (PUT) returning an RxJS Observable<T> for Angular services
   */
  public update$<T = unknown, D = unknown>(url: string, data?: D, config?: AxiosRequestConfig): Observable<T> {
    return defer(() => from(this.update<T, D>(url, data, config, false)));
  }

  /**
   * Patch (PATCH) returning an RxJS Observable<T> for Angular services
   */
  public patch$<T = unknown, D = unknown>(url: string, data?: D, config?: AxiosRequestConfig): Observable<T> {
    return defer(() => from(this.update<T, D>(url, data, config, true)));
  }

  /**
   * Delete (DELETE) returning an RxJS Observable<T> for Angular services
   */
  public delete$<T = unknown>(url: string, config?: AxiosRequestConfig): Observable<T> {
    return defer(() => from(this.delete<T>(url, config)));
  }

  /**
   * Standard aliases for REST conventions
   */
  public get = this.read.bind(this);
  public post = this.create.bind(this);
  public put = this.update.bind(this);
  public patch = (url: string, data?: unknown, config?: AxiosRequestConfig) => this.update(url, data, config, true);

  public get$ = this.read$.bind(this);
  public post$ = this.create$.bind(this);
  public put$ = this.update$.bind(this);
}

// Export singleton instance as default utility
export const apiClient = new ApiClient();
