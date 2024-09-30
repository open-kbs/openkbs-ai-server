import jwtDecode from 'jwt-decode';

export function getSession() {
  const token = localStorage.getItem('userToken');
  return token && jwtDecode(token).username;
}