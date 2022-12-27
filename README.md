# Situs nonton anime tanpa iklan

Ini adalah projek yang dibuat agar orang-orang dapat menonton anime gratis dan tanpa iklan sedikit pun.  

## Tujuan

Tujuan awal projek ini dibuat adalah untuk kepentingan pembuat sendiri, tetapi sekarang semua orang dapat memilikinya dan berkontribusi didalamnya

### Fitur

Fitur yang dimiliki di antaranya adalah:  
- Tanpa iklan  
- Gratis  
- UI yang sederhana  
- Notifikasi saat anime terbaru rilis  
- Admin control  
dan lainnya...

# Install & setup

## Install

Sebelum itu. Pastikan kamu sudah menginstal node.js versi 16 keatas, jika belum, kamu bisa menginstall nya [di sini](https://nodejs.org/en/download/)  
Kamu dapat memeriksa versi node.js kamu dengan perintah sebagai berikut:  
```bash
node -v
```  
setelah menginstal node.js, langkah selanjutnya kamu bisa mendownload projek ini [di sini](https://github.com/FightFarewellFearless/anime/archive/refs/heads/master.zip) atau melalui perintah berikut:  
```bash
git clone https://github.com/FightFarewellFearless/anime.git
```  
Selanjutnya adalah menginstal library yang dibutuhkan dengan cara mengetikkan perintah berikut:  
```bash
npm install
```
tunggu hingga selesai...  

## Setup

Jika semua proses di atas sudah selesai, langkah selanjutnya adalah setup environment.  
**Peringatan: environment harus aman, jangan bagikan sesuatu di dalamnya kepada siapapun**  
Tapi sebelum itu, baiknya kita buat Vapid private & public key terlebih dahulu, ini dilakukan agar dapat mengirimkan notifikasi saat anime terbaru rilis, key yang sudah dibuat akan digunakan untuk mengenkripsi pesan yang di kirim (ini udah standar nya begitu).  
Untuk membuat key jalankan perintah berikut:  
```bash
./node_modules/.bin/web-push generate-vapid-keys
```  
simpan key tersebut untuk nanti kita akan taruh di dalam environment.  

### Environment

Setelah semua proses di atas, sekarang saatnya pembuatan environment.  
untuk membuat environment cara simple nya kamu bisa buat file dengan nama ".env" atau jika kamu berada di hosting public seperti replit dan glitch, mereka biasanya mempunyai environment mereka sendiri kamu dapat memeriksanya, jika ada, maka kamu tidak perlu membuat file .env  
  
Ok, selanjutnya kamu dapat copy text di bawah ini:  
```
port='port untuk listen ke server (Masukkan angka)'
key='Di gunakan untuk enkripsi database. silahkan taruh apapun di sini'
salt='sama seperti key'
token='Ini adalah password admin kamu, jangan bagikan ke siapapun'
publicKey='paste kan public key yang sudah dibuat di atas tadi'
privateKey='paste kan private key yang sudah dibuat di atas tadi'
mail='email apa saja, ini digunakan untuk mengirimkan notifikasi'
```  

## Selesai!

Semua sudah ter-setup dengan baik. Sekarang saatnya menjalankan server kamu. Gunakan perintah berikut:  
```bash
node index.js
```  
Jika sudah ada pesan "listening to (port)" di console maka kamu bisa ke http://localhost:port  

# Demo

Kamu dapat melihat situs aslinya di [anime.pirles.ga](https://anime.pirles.ga)

# Contribute

Kamu bisa berkontribusi dengan cara clone repo ini dan kemudian open pull request, perubahan kamu akan diperiksa dan akan di accept tergantung pada perubahan yang kamu buat

# License
Distributed under the MIT License. See LICENSE for more information.