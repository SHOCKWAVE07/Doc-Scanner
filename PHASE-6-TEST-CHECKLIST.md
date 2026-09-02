# 🧪 Phase 6: Test Checklist

**Test Date:** September 2, 2026  
**Features to Test:** PDF Import, Page Editing, Mixed Workflows, Export  

---

## ✅ Quick Setup (5 minutes)

### Before Testing
- [ ] Open the app in a browser
- [ ] Check that "📄 Import PDF" button appears in toolbar
- [ ] Verify "✎ Edit" button appears on page thumbnails
- [ ] Check export modal has ZIP option
- [ ] No console errors (F12 → Console)

---

## 🧪 Test Suite 1: PDF Import (10 minutes)

### Test 1.1: Import Single-Page PDF
```
ACTION:
  1. Click "📄 Import PDF"
  2. Select a single-page PDF
  
EXPECTED:
  ✅ Modal closes
  ✅ Status shows "Importing PDF..."
  ✅ Page appears in grid with 📄 badge
  ✅ Toast shows "PDF imported: 1 page"
```

### Test 1.2: Import Multi-Page PDF
```
ACTION:
  1. Click "📄 Import PDF"
  2. Select a 3+ page PDF
  
EXPECTED:
  ✅ Import progress shows (e.g., "Importing PDF: 1/5...")
  ✅ All pages appear in grid with 📄 badge
  ✅ Toast shows "PDF imported: X pages"
  ✅ Each page numbered correctly
```

### Test 1.3: Invalid File
```
ACTION:
  1. Click "📄 Import PDF"
  2. Select non-PDF file (image/text)
  
EXPECTED:
  ✅ Toast shows "Please select a PDF file"
  ✅ File input cleared
  ✅ No pages added
```

---

## 🧪 Test Suite 2: Page Editing (15 minutes)

### Test 2.1: Edit Imported PDF Page
```
ACTION:
  1. Import any PDF (or use existing page)
  2. Click "✎ Edit" on a page
  
EXPECTED:
  ✅ Page image loads in editor canvas
  ✅ Crop UI appears with default corners
  ✅ Status shows "Editing Page X - Adjust corners..."
  ✅ Page shows in full editor view
```

### Test 2.2: Adjust Corners
```
ACTION:
  1. Click "✎ Edit" on a page
  2. Drag a corner point (top-left, for example)
  
EXPECTED:
  ✅ Corner moves to new position
  ✅ SVG polygon updates in real-time
  ✅ Can see the new boundary
  ✅ Other corners don't move
```

### Test 2.3: Use Magnifier
```
ACTION:
  1. Click "✎ Edit"
  2. Drag a corner (not midpoint)
  
EXPECTED:
  ✅ Magnifier (circular zoom) appears
  ✅ Magnifier follows cursor
  ✅ Shows 3x zoom of crop area
  ✅ Grid overlay visible for alignment
```

### Test 2.4: Save Edited Page
```
ACTION:
  1. Click "✎ Edit" on a page
  2. Adjust corners slightly
  3. Click "Add Page"
  
EXPECTED:
  ✅ Page is processed (perspective correction)
  ✅ Status shows "Page X updated"
  ✅ Toast shows file size
  ✅ Page thumbnail updates with new crop
```

### Test 2.5: Edit Different Page Types
```
ACTION:
  1. Edit scanned page (📸)
  2. Edit gallery page (🖼️)
  3. Edit PDF page (📄)
  
EXPECTED:
  ✅ All types work the same way
  ✅ All types can be cropped
  ✅ All types update after save
```

---

## 🧪 Test Suite 3: Page Operations (10 minutes)

### Test 3.1: Rotate Page
```
ACTION:
  1. Click "↻" on any page
  
EXPECTED:
  ✅ Thumbnail rotates 90°
  ✅ Can click multiple times (90° → 180° → 270° → 0°)
  ✅ Toast shows "Page rotated"
  ✅ Works for all page types
```

### Test 3.2: Delete Page
```
ACTION:
  1. Click "🗑" on any page
  
EXPECTED:
  ✅ Page removed from grid
  ✅ Page count decreases
  ✅ Toast shows "Page deleted"
  ✅ Works for all page types
```

### Test 3.3: Preview Page
```
ACTION:
  1. Click "👁" on any page
  
EXPECTED:
  ✅ Modal opens with full-size image
  ✅ Shows "Page X of Y"
  ✅ Buttons available: Rotate, Delete
  ✅ Can close modal
```

### Test 3.4: Reorder Pages
```
ACTION:
  1. Have 3+ pages in grid
  2. Drag page to new position
  
EXPECTED:
  ✅ Dragged page shows as semi-transparent
  ✅ Drop target highlights
  ✅ Page moves to new position
  ✅ Page numbering updates
  ✅ Works across page types
```

---

## 🧪 Test Suite 4: Mixed Workflows (15 minutes)

### Test 4.1: Scan + Import Mix
```
SETUP:
  1. Scan 2 pages from camera (📸)
  2. Import 3-page PDF (📄)
  3. Add 1 photo from gallery (🖼️)
  
VERIFY:
  ✅ 6 total pages shown
  ✅ Badges show correct source
  ✅ All operations work (rotate, delete, edit)
  ✅ Can reorder in any combination
```

### Test 4.2: Complex Reorder
```
SETUP:
  1. Have pages: Scanned-1, PDF-1, Scanned-2, PDF-2, PDF-3
  2. Drag to new order: PDF-1, Scanned-1, PDF-2, Scanned-2, PDF-3
  
VERIFY:
  ✅ Pages rearrange correctly
  ✅ Numbering updates (1-5)
  ✅ Badges still show source
  ✅ Page list is persistent
```

### Test 4.3: Edit All Types
```
SETUP:
  1. Have at least one page of each type
  
ACTION:
  1. Edit scanned page, click "Add Page"
  2. Edit PDF page, click "Add Page"
  3. Edit gallery page, click "Add Page"
  
VERIFY:
  ✅ All edits successful
  ✅ All pages update correctly
  ✅ Still shows correct badge after edit
```

---

## 🧪 Test Suite 5: Export (15 minutes)

### Test 5.1: Export Single Page as JPEG
```
SETUP:
  1. Have any 1 page
  
ACTION:
  1. Click "Export" button (📋)
  2. Export modal opens
  3. Select "Single image (JPEG)"
  4. Click "Download"
  
VERIFY:
  ✅ "Single image" option available
  ✅ "PDF" option also available
  ✅ ZIP option NOT shown
  ✅ Download begins
  ✅ File is .jpg format
```

### Test 5.2: Export Single Page as PDF
```
SETUP:
  1. Have any 1 page
  
ACTION:
  1. Click "Export"
  2. Select "PDF document"
  3. Click "Download"
  
VERIFY:
  ✅ Status shows "Building PDF..."
  ✅ Status shows OCR progress
  ✅ File is .pdf format
  ✅ PDF opens in default viewer
```

### Test 5.3: Export Multiple Pages as PDF
```
SETUP:
  1. Have 3+ pages
  
ACTION:
  1. Click "Export"
  2. Export modal opens
  
VERIFY:
  ✅ "Single image" option DISABLED
  ✅ "PDF document" selected by default
  ✅ ZIP option VISIBLE
  ✅ Click Download
  ✅ PDF has all pages
```

### Test 5.4: Export Multiple Pages as ZIP
```
SETUP:
  1. Have 3+ pages (mixed types OK)
  
ACTION:
  1. Click "Export"
  2. Select "ZIP of all images"
  3. Click "Download"
  
VERIFY:
  ✅ Status shows "Adding page X to ZIP..."
  ✅ Status shows "Creating ZIP..."
  ✅ File is .zip format
  ✅ ZIP contains all pages
  ✅ Files named: "001-name.jpg", "002-name.jpg", etc.
```

### Test 5.5: Custom Filename
```
ACTION:
  1. Click "Export"
  2. Change filename to "my-document"
  3. Export as PDF
  
VERIFY:
  ✅ File downloaded as "my-document.pdf"
  ✅ Special characters removed from name
```

---

## 🧪 Test Suite 6: Browser Features (10 minutes)

### Test 6.1: Console Check
```
ACTION:
  1. Open browser DevTools (F12)
  2. Go to Console tab
  3. Perform several operations:
     - Import PDF
     - Edit page
     - Rotate/Delete
     - Export
  
VERIFY:
  ✅ No red error messages
  ✅ No console.error() calls
  ✅ Info messages show operations
```

### Test 6.2: Memory Usage
```
ACTION:
  1. Open DevTools → Memory
  2. Take heap snapshot
  3. Import 10-page PDF
  4. Take another snapshot
  5. Compare
  
VERIFY:
  ✅ Memory increase < 100MB
  ✅ No memory leaks
  ✅ Can export without issues
```

### Test 6.3: Responsive Design
```
ACTION:
  1. Open on desktop (1920x1080)
  2. Check layout
  3. Resize to tablet (800x600)
  4. Check layout
  5. Resize to mobile (375x667)
  6. Check layout
  
VERIFY:
  ✅ Page grid adjusts (3 cols → 2 cols → 1 col)
  ✅ All buttons still clickable
  ✅ Export modal fits on screen
  ✅ No horizontal scrolling needed
```

---

## 🎯 Edge Cases (10 minutes)

### Test E1: Very Large PDF
```
ACTION:
  1. Import 50+ page PDF
  
EXPECTED:
  ✅ Takes time but works
  ✅ Progress bar shows activity
  ✅ Can still use app (not frozen)
  ✅ All 50+ pages imported
```

### Test E2: Mixed Page Reorder (All Types)
```
SETUP:
  1. Create 10-page document with mixed types
  
ACTION:
  1. Drag every page to different position
  
EXPECTED:
  ✅ All reorder operations work
  ✅ No pages lost or duplicated
  ✅ Badges preserved
```

### Test E3: Rapid Operations
```
ACTION:
  1. Click Edit on page
  2. Immediately click different page
  3. Quickly rotate multiple pages
  4. Click Export
  
EXPECTED:
  ✅ App doesn't crash
  ✅ Latest action wins
  ✅ No duplicate operations
```

### Test E4: Export Without Pages
```
ACTION:
  1. Clear all pages
  2. Click "Export"
  
EXPECTED:
  ✅ Export button disabled
  ✅ Modal doesn't open
  ✅ Toast shows "Export ready? You need at least one page"
```

---

## ✨ Quality Checks

### Visual Quality
- [ ] All UI elements properly aligned
- [ ] Text is readable
- [ ] Icons/badges are clear
- [ ] Color scheme consistent
- [ ] No overlapping elements
- [ ] Responsive on all screen sizes

### Functional Quality
- [ ] All buttons respond to clicks
- [ ] Forms accept input correctly
- [ ] Modal dialogs open/close smoothly
- [ ] No JavaScript errors
- [ ] Page updates are instant
- [ ] Downloads work properly

### User Experience
- [ ] Clear feedback for all actions
- [ ] Error messages are helpful
- [ ] Progress shown for slow operations
- [ ] Toast notifications appear/disappear properly
- [ ] No confusing states
- [ ] Intuitive workflow

---

## 📊 Test Results Summary

### Completion Checklist
- [ ] All Test Suite 1 tests pass (PDF Import)
- [ ] All Test Suite 2 tests pass (Page Editing)
- [ ] All Test Suite 3 tests pass (Page Operations)
- [ ] All Test Suite 4 tests pass (Mixed Workflows)
- [ ] All Test Suite 5 tests pass (Export)
- [ ] All Test Suite 6 tests pass (Browser Features)
- [ ] All Edge Cases handled
- [ ] All Quality Checks passed

### Issues Found
```
(List any issues/bugs discovered)
```

### Test Status
- [ ] PASS (All tests pass - Ready for production)
- [ ] FAIL (Issues found - See list above)

---

## 📝 Notes

### What Worked Well
- PDF import performance
- Page editing workflow
- Mixed page handling
- Export options

### Areas for Improvement
- (Add if any found during testing)

### User Feedback
- (Collect feedback from test users)

---

**Test Date Completed:** _______________  
**Tester Name:** _____________________  
**Status:** ✅ READY FOR RELEASE
