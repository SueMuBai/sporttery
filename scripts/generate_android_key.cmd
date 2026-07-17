@echo off
setlocal
set KEYSTORE=caiguo-release.jks
set ALIAS=caiguo
if exist %KEYSTORE% (
  echo %KEYSTORE% already exists. Refusing to overwrite.
  exit /b 1
)
echo Enter and safely record the keystore password when prompted.
keytool -genkeypair -v -keystore %KEYSTORE% -alias %ALIAS% -keyalg RSA -keysize 4096 -validity 10000 -dname "CN=CaiGuo, OU=SueMuBai, O=SueMuBai, L=Shanghai, ST=Shanghai, C=CN"
certutil -encode %KEYSTORE% caiguo-release.base64.txt
keytool -list -v -keystore %KEYSTORE% -alias %ALIAS% > caiguo-release-fingerprint.txt
echo Generated %KEYSTORE%, Base64 secret, and fingerprint file.
endlocal
