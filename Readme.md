This is a PWA (Progressive Web Apps) encryption tool.  
It uses the AES-256-CBC encryption algorithm and uses string as password.

 - When the encrypted data is small, the encrypted content is directly shared in the URL: `https://CDE_TOOL_URL/#BASE64_STRING`.
 - When the encrypted data is large, such as including pictures, videos, and files, you need to share the packaged encrypted file with `https://CDE_TOOL_URL` separately.
 - You can also upload encrypted file to a file server and simply share the URL as follows: `https://CDE_TOOL_URL/#+https://ENCRYPTED_FILE_URL` (`https://` after `#+` is optional) (The file server should support CORS, or use CORS proxy instead).

`tools/aes` is a script encryption tool that uses the openssl command, which can be used to verify the correctness of web page encryption.  
More specific packaging formats can be found at the top of the `src/app.js` comments.
