import axios, { AxiosError } from 'axios';
import { SocksProxyAgent } from 'socks-proxy-agent';

async function testProxyConnection() {
  const url = 'https://ip.decodo.com/json';
  const proxyAgent = new SocksProxyAgent(
    'socks5h://user-sp6mbpcybk-session-1:K40SClud=esN8jxg9c@gate.decodo.com:7000'
  );

  try {
    console.log('Testing proxy connection...');
    const response = await axios.get(url, {
      httpsAgent: proxyAgent,
    });
    console.log('Proxy connection successful! Response:', response.data);
    return true;
  } catch (error) {
    if (error instanceof AxiosError) {
      console.error('Proxy connection failed:', error.message);
    } else {
      console.error('Unknown error occurred:', error);
    }
    return false;
  }
}

// Run the test
testProxyConnection(); 