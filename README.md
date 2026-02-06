# SCS

**Professional Student Collection System for Educational Institutions**

SCS is a powerful offline-first desktop application built with Electron, designed to streamline payment management for educational institutions. With structured file organization, automatic PDF generation, and complete local data control, SCS empowers staff to manage student records and payments efficiently without relying on internet connectivity.

## ✨ Key Features

### 🖥️ Desktop Application
- **Native Windows App**: Runs as a standalone `.exe` application
- **Fully Offline**: No internet connection required for core operations
- **Professional UI**: Modern, responsive interface with dark mode support
- **Fast Performance**: Optimized for handling large datasets

### 📁 Structured File Management
SCS automatically organizes all payment documents in a clear, hierarchical folder structure:

```
Your Folder/
└── SCS/
    ├── Computer Science/
    │   ├── John Doe/
    │   │   ├── Semester 1/
    │   │   │   ├── Receipt-RCP-2026-00001.pdf
    │   │   │   ├── Payment-Proof-20260115.pdf
    │   │   │   └── Statement-Jan2026.pdf
    │   │   └── Semester 2/
    │   └── Jane Smith/
    └── Business Administration/
```

**File Naming**: All PDFs are named clearly and concisely for easy identification

### 👥 Student Management
- Add, edit, and search student records
- Track student status (Active/Inactive)
- View complete payment history per student
- Filter by name, ID, email, or program

### 💰 Payment Processing
- Record payments with multiple methods (Cash, Card, Bank Transfer, Online)
- Automatic receipt generation for every payment
- PDF receipts stored in organized folders
- Payment history tracking

### 📄 Automatic PDF Generation
- Professional receipts with sequential numbering
- Receipts saved to:  
  `/SCS/{Course}/{StudentName}/{Semester}/Receipt-{Number}.pdf`
- Institution branding customization
- Print or download receipts instantly

### 📊 Financial Reports
- Generate monthly financial statements
- Payment method breakdown and analysis
- Date range filtering for custom reports
- Export reports as PDF

### 💾 Backup & Multi-PC Continuity
- **Manual Backup**: Export all data (IndexedDB + PDFs) as a single backup file
- **Multi-PC Support**: Import backups on different computers
- **Cloud Storage Compatible**: Store backups in Google Drive, Dropbox, or USB drives
- **Data Migration**: Easily move between computers while maintaining folder structure

## 🚀 Getting Started

### Prerequisites
- Windows 10 or later
- Node.js v16+ (for development only)

### Installation for Development

1. **Clone or download the project**
   ```bash
   cd scs
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Run in development mode**
   ```bash
   npm run electron:dev
   ```

4. **Build Windows executable**
   ```bash
   npm run electron:build
   ```
   The `.exe` installer will be in the `dist-electron` folder.

### First Run Setup

1. Launch SCS
2. Select a base folder for storing all payment files
3. SCS will create a `SCS` folder inside your selected location
4. Start managing payments!

## 📖 Usage Guide

### Adding Students

1. Navigate to **Students** page
2. Click **"➕ Add New Student"**
3. Fill in student details (ID, Name, Program/Course)
4. Click **"➕ Add Student"**

### Recording Payments

1. Go to **Payments** page
2. Click **"💰 Record New Payment"**
3. Select student, enter amount, and choose payment method
4. Click **"💰 Record Payment"**
5. Receipt is automatically generated and saved to:  
   `/SCS/{Course}/{StudentName}/{Semester}/Receipt-{Number}.pdf`

### Managing File Storage

1. Go to **Settings** page
2. View current storage folder under **"📁 File Storage Location"**
3. Click **"📂 Change Folder"** to select a new location
4. Click **"🗂️ Open in Explorer"** to browse saved files

### Backup & Restore

#### Creating a Backup
1. Navigate to **Settings** → **Data Management**
2. Click **"💾 Backup Data"**
3. Choose save location
4. Backup file includes:
   - All database records (students, payments, receipts)
   - All PDF files (receipts, proofs, statements)

#### Restoring from Backup
1. Navigate to **Settings** → **Data Management**
2. Click **"📁 Import Data"**
3. Select your backup file
4. All data and files will be restored

### Multi-PC Continuity

**Scenario**: Move from Office PC to Home PC

1.  **On Office PC**: Export backup to USB drive or cloud storage
2. **On Home PC**: Install SCS
3. **First Run**: Select a base folder
4. **Import Backup**: Settings → Import Data → Select backup file
5. **All Done**: All students, payments, and PDFs are now on the new PC

## 🛠️ Technical Stack

- **Framework**: Electron (Desktop App)
- **Frontend**: Vanilla JavaScript (ES Modules)
- **Build Tool**: Vite
- **Database**: IndexedDB (local browser database)
- **File System**: Native Node.js fs module via Electron IPC
- **PDF Generation**: jsPDF
- **Charts**: Chart.js
- **Styling**: Custom CSS with CSS Variables

## 📁 Project Structure

```
scs/
├── electron/               # Electron main and preload scripts
│   ├── main.js            # Main process (app lifecycle, file system)
│   └── preload.js         # Secure IPC bridge
├── src/
│   ├── components/        # UI components
│   │   ├── Dashboard.js
│   │   ├── Students.js
│   │   ├── Payments.js
│   │   ├── FirstRunSetup.js
│   │   └── ThemeToggle.js
│   ├── services/          # Business logic
│   │   └── fileSystem.js  # File system management
│   ├── db/                # Database layer
│   │   └── database.js
│   ├── models/            # Data models
│   ├── utils/             # Utilities
│   │   ├── pdfGenerator.js
│   │   └── formatting.js
│   ├── styles/            # CSS
│   └── main.js            # App entry point
├── index.html
├── package.json
├── vite.config.js
└── README.md
```

## 🔒 Security & Privacy

- **100% Offline**: No data leaves your computer
- **No Server Dependencies**: Runs entirely locally
- **No Tracking**: Zero analytics or data collection
- **No Internet Required**: Core functionality works without connectivity
- **Local File Control**: You own all your data and files

## 💡 Best Practices

1. **Backup Regularly**: Weekly backups recommended for active usage
2. **Use Cloud Storage**: Store backups in Google Drive/Dropbox for extra safety
3. **Test Restore**: Occasionally test restoration to ensure backups work
4. **Keep Folder Path Safe**: Don't move or delete the base SCS folder
5. **Use Descriptive Programs**: Use clear course/program names for better organization

## 🐛 Troubleshooting

### First Run Setup Not Appearing
- Ensure you're running the desktop app (`.exe`), not the web version
- Clear browser data if testing in development mode

### Files Not Saving
- Check folder permissions - ensure SCS can write to selected folder
- Verify selected folder still exists
- Check Settings → File Storage Location for current path

### Cannot Open File Explorer
- Ensure the folder path hasn't been moved or deleted
- Try changing the base folder in Settings

### Backup Won't Import
- Verify the file is a valid SCS backup (`.json`)
- Ensure sufficient disk space for file extraction
- Check browser console (F12) for error details

## 📞 Support

For issues, questions, or feedback:
- Check the console (F12) for error messages
- Ensure you have the latest version
- Try exporting a backup before troubleshooting

## 📝 License

This project is provided for educational and business use.

---

**Built with ❤️ for efficient payment management**  
*SCS - Track Payments, Not Headaches*
