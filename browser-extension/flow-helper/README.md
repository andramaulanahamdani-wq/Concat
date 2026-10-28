# Flow Helper

Ekstensi Chrome / Brave (Manifest V3) untuk mempercepat kerja di
[Google Flow](https://labs.google/fx/tools/flow): unduh banyak gambar
sekaligus, auto-unduh hasil baru, antrean prompt, pustaka prompt, dan
lembar kontak.

> Ekstensi ini **tidak resmi** dan tidak berafiliasi dengan Google.
> Semua proses berjalan di browser kamu sendiri; tidak ada data yang dikirim
> ke server lain.

## Pasang

1. Unduh / clone folder `browser-extension/flow-helper`.
2. Buka `chrome://extensions` (Brave: `brave://extensions`).
3. Aktifkan **Developer mode** (pojok kanan atas).
4. Klik **Load unpacked** lalu pilih folder `flow-helper`.
5. Buka atau muat ulang tab Google Flow. Tombol bulat Flow Helper muncul di
   pojok kanan bawah.

Tips: matikan "Tanyakan lokasi penyimpanan sebelum mengunduh" di pengaturan
unduhan browser supaya unduhan massal tidak memunculkan dialog untuk tiap file.
Saat pertama kali mengunduh banyak file, Chrome bisa bertanya "Izinkan
labs.google mengunduh beberapa file?". Pilih **Izinkan**.

## Fitur

### Unduh massal (tab **Unduh**)
- Semua gambar hasil di halaman terdeteksi otomatis. Ikon, avatar dan
  thumbnail kecil disaring berdasarkan ukuran minimum.
- Pilih dengan klik, **Shift+klik** untuk memilih rentang, atau pakai tombol
  *Pilih semua / Kosongkan / Balik / Yang baru*.
- **Unduh**: tiap gambar disimpan sebagai file terpisah di
  `Downloads/Flow/<proyek>/…`.
- **ZIP**: semua yang dipilih dibungkus menjadi satu file ZIP, lengkap dengan
  `prompts.csv` (nama file, prompt, ukuran, sumber).
- Bila tidak ada yang dipilih, tombol bekerja untuk **semua** gambar, dan
  gambar yang sudah pernah diunduh dilewati.
- Kualitas penuh: URL thumbnail (Next.js `/_next/image`, ukuran
  `=w400` di googleusercontent) diganti ke versi aslinya.
- Konversi format opsional ke **PNG / JPG / WebP**.
- Tanda ✓ untuk gambar yang sudah diunduh, di panel dan di halaman Flow.

### Tombol di atas gambar Flow
Arahkan kursor ke gambar di Flow untuk memunculkan tombol:
☐ pilih · ⬇ unduh langsung · ⤢ perbesar (lihat prompt, salin, pakai lagi).

### Penamaan file pintar
Pola nama bisa diatur, misalnya `{project}/{date}_{n}_{prompt}`.
Token yang tersedia: `{project}` `{date}` `{time}` `{n}` `{prompt}` `{w}` `{h}`
`{id}` `{type}`. Tanda `/` membuat subfolder.
Prompt diambil dari prompt yang kamu kirim di sesi itu, atribut gambar, atau
teks di dekat gambar.

### Auto-unduh
Nyalakan **Auto-unduh hasil baru**, dan setiap gambar yang baru selesai dibuat
langsung tersimpan dengan nomor urut yang terus berlanjut (001, 002, …).
Gambar yang sudah ada saat fitur dinyalakan tidak ikut diunduh.

### Antrean prompt (tab **Antrean**)
- Tempel banyak prompt, satu per baris (atau pisahkan dengan baris kosong
  untuk prompt panjang). Baris berawalan `#` diabaikan.
- **Variasi otomatis**: `seekor kucing {oranye|hitam} di {atap|jendela}`
  menjadi 4 prompt.
- **Preset gaya** (Sinematik, Horor, Anime, Fotoreal, 9:16, Latar hijau, atau
  buatanmu sendiri) ditambahkan ke akhir tiap prompt.
- Ulangi tiap prompt N kali, atur jeda, dan pilih *Tunggu hasil* agar prompt
  berikutnya dikirim setelah hasil sebelumnya muncul.
- Jeda / Lanjut / Stop. Antrean yang terhenti karena tab dimuat ulang bisa
  dilanjutkan.
- Notifikasi saat antrean selesai.

### Pustaka prompt (tab **Pustaka**)
- Simpan prompt favorit (★), cari, lalu **Pakai** untuk memasukkannya ke kotak
  prompt Flow atau **+Antrean**.
- **Riwayat** otomatis mencatat setiap prompt yang kamu kirim.
- Ekspor / impor (JSON atau .txt satu prompt per baris).

### Lembar kontak
Gabungkan gambar terpilih menjadi satu PNG grid bernomor, dengan
prompt di bawah tiap gambar. Berguna untuk review storyboard atau dikirim ke
klien.

### Lainnya
- Popup toolbar: statistik unduhan & prompt hari ini, grafik 14 hari,
  tombol cepat.
- Klik kanan di Flow: *Unduh gambar ini*, *Simpan teks terpilih ke Pustaka*,
  *Tambahkan ke Antrean*.
- Tombol bulat bisa diseret ke posisi lain, dan panel bisa dipindah ke sisi
  kiri (⇆) bila menutupi tombol Flow.
- Cadangkan / pulihkan semua data dari halaman Pengaturan.

## Pintasan keyboard

| Pintasan | Aksi |
| --- | --- |
| `Alt+Shift+F` | Tampilkan / sembunyikan panel |
| `Alt+Shift+D` | Unduh yang dipilih (atau semua) |
| `Alt+Shift+Z` | Unduh yang dipilih sebagai ZIP |
| `Esc`, `←` `→` | Tutup / navigasi tampilan perbesar |

Ubah di `chrome://extensions/shortcuts`.

## Catatan

- Google sering mengubah tampilan Flow. Ekstensi ini sengaja tidak bergantung
  pada nama class Flow; deteksi berdasarkan ukuran gambar dan kotak teks
  terbesar. Jika suatu saat gambar tidak terdeteksi, coba turunkan **Ukuran
  minimum** di tab *Atur*, lalu tekan ⟳ Pindai.
- Antrean prompt mengetik ke kotak prompt dan menekan tombol buat milik Flow,
  sama seperti kamu melakukannya sendiri. Batas kuota/kredit akun Flow tetap
  berlaku. Pakai jeda yang wajar.
- Data (pengaturan, pustaka, riwayat, statistik) disimpan di
  `chrome.storage.local` di komputermu.

## Struktur

```
manifest.json          izin, content script, pintasan
background.js          service worker: unduhan, menu klik kanan, notifikasi, statistik
offscreen/             dokumen offscreen: ambil gambar, konversi, ZIP, lembar kontak
content/scanner.js     deteksi gambar/video & prompt
content/flow-input.js  isi kotak prompt & tekan tombol buat
content/queue.js       antrean prompt
content/panel.js/.css  panel, tombol di atas gambar, lightbox (Shadow DOM)
content/main.js        penghubung, auto-unduh, pesan
lib/                   pengaturan bersama, penamaan, penulis ZIP
popup/, options/       popup toolbar & halaman pengaturan
```
