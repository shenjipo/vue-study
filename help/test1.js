const { exec } = require('child_process');

// 执行Git命令  
exec('git status', (error, stdout, stderr) => {
    if (error) {
        console.error(`执行出错: ${error}`);
        return;
    }
    if (stderr) {
        console.error(`stderr: ${stderr}`);
        return;
    }
    console.log('stdoutfsadf', stdout, typeof stdout);
});