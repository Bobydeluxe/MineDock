console.log('[Server thread/INFO]: Done (0.1s)! For help, type "help"');
console.error('java.lang.OutOfMemoryError: Java heap space');
setTimeout(() => process.exit(1), 30);
