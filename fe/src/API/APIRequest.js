import axios from "axios";

export const APIRequest = async (method, url, data, config = {}, settings = {}) => {

    const token = localStorage.getItem('userToken');

    const headers = {...config?.headers };
    if (token) headers['Authorization'] = `Bearer ${token}`

    try {
        let response;
        if (['post', 'put', 'patch'].includes(method.toLowerCase())) {
            response = await axios[method.toLowerCase()](url, data, { ...config, headers });
        } else {
            response = await axios[method.toLowerCase()](url, { ...config, headers, data });
        }
        return response;
    } catch (error) {
        if (settings.optimistic) return;
        const status = error?.response?.status;

        if (error?.code?.startsWith("ERR_NETWORK")) {
            window.dispatchEvent(new CustomEvent('networkError', {
                detail: {
                    message: error.message
                }
            }));

            return;
        }
        
        console.error(`API request error to url ${url} status ${status}:`, error);

        if (status === 401) {            
            return window.dispatchEvent(new Event('unauthorizedError'));
        }  else if (status === 409) {
            return window.dispatchEvent(new Event('noUsersRegistered'));
        } 
        else if (status === 500) {
            if (error?.response?.data?.error) alert(error?.response?.data?.error)            
            return;
        } 
        else {
            throw error;
        }
    }
};