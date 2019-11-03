This is a PWA (Progressive Web Apps) encryption tool for testing purpose.  
It uses the AES-256-CBC encryption algorithm and uses string as password.

When the encrypted data is small, the encrypted content is directly shared in the URL.  
When the encrypted data is large, such as including pictures, videos, and files, you need to share the packaged encrypted file.

`tools/aes` is a script encryption tool that uses the openssl command, which can be used to verify the correctness of web page encryption.  
More specific packaging formats can be found at the top of the `src/app.js` comments.
