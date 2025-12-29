# Contributing to PLANY

Thank you for your interest in contributing to PLANY! This document provides guidelines for contributing to the project.

## Code of Conduct

Be respectful, inclusive, and constructive in all interactions.

## How to Contribute

### Reporting Bugs

1. Check if the bug has already been reported in Issues
2. Create a new issue with:
   - Clear title and description
   - Steps to reproduce
   - Expected vs actual behavior
   - Screenshots if applicable
   - Browser and OS information

### Suggesting Features

1. Check if the feature has been suggested
2. Create a new issue with:
   - Clear description of the feature
   - Use cases and benefits
   - Potential implementation approach

### Pull Requests

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Test thoroughly
5. Commit with clear messages: `git commit -m 'Add amazing feature'`
6. Push to your fork: `git push origin feature/amazing-feature`
7. Open a Pull Request

## Development Setup

```bash
# Clone your fork
git clone https://github.com/your-username/project-plany-app.git
cd project-plany-app

# Install dependencies
npm install

# Create .env file
cp .env.example .env
# Add your Firebase credentials

# Start development server
npm run dev
```

## Project Structure

```
project-plany-app/
├── src/
│   ├── firebase.js       # Firebase initialization
│   ├── auth.js          # Authentication service
│   ├── database.js      # Firestore database service
│   ├── main.js          # Main app logic
│   └── styles.css       # Global styles
├── index.html           # HTML entry point
├── package.json         # Dependencies
└── vite.config.js       # Vite configuration
```

## Coding Standards

### JavaScript
- Use ES6+ features
- Use async/await for asynchronous operations
- Add JSDoc comments for functions
- Handle errors appropriately
- Keep functions focused and small

### CSS
- Use CSS custom properties for theming
- Follow BEM naming convention
- Mobile-first responsive design
- Use semantic class names

### Commits
- Use present tense ("Add feature" not "Added feature")
- Use imperative mood ("Move cursor to..." not "Moves cursor to...")
- Limit first line to 72 characters
- Reference issues and PRs when applicable

## Testing

Before submitting a PR:
- [ ] Test on Chrome, Firefox, and Safari
- [ ] Test on mobile devices
- [ ] Test authentication flow
- [ ] Test CRUD operations for lessons, templates, schedule
- [ ] Check for console errors
- [ ] Verify Firestore rules work correctly

## Firebase Integration

When working with Firebase:
- Use the existing `dbService` for all Firestore operations
- Use the existing `authService` for authentication
- Add proper error handling
- Update Firestore security rules if needed
- Document new collection structures

## Adding New Features

1. **Update Database Service**: Add methods to `database.js`
2. **Update UI**: Add HTML structure and styling
3. **Update App Logic**: Add event handlers and state management in `main.js`
4. **Update Documentation**: Update README.md if needed
5. **Test Thoroughly**: Test all user flows

## Release Process

1. Update version in `package.json`
2. Update CHANGELOG.md
3. Create a release tag
4. Deploy to Firebase Hosting

## Questions?

Feel free to open an issue for any questions or clarifications.

Thank you for contributing! 🎉
