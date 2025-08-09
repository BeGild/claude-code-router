import { getServiceInfo } from './processCheck';
import { UIEnhancer } from './uiEnhancer';

export async function showStatus() {
    const ui = new UIEnhancer();
    const info = await getServiceInfo();
    
    console.log('\n' + ui.createTitle('Claude Code Router Status', 60));
    
    if (info.running) {
        console.log('\n' + ui.separator('✅ Service Status', 60));
        console.log(ui.formatSystemInfo(info));
        
        // 系统信息卡片
        console.log('\n' + ui.separator('🎯 Quick Actions', 60));
        const actions = [
            [ui.color('ccr code "your prompt"', 'cyan'), ui.color('Start Claude Code with router', 'gray')],
            [ui.color('ccr stop', 'red'), ui.color('Stop the router service', 'gray')],
            [ui.color('ccr ui', 'blue'), ui.color('Open web interface', 'gray')],
            [ui.color('ccr router', 'green'), ui.color('Manage routing groups', 'gray')]
        ];
        console.log(ui.createTable([['📋 Command', '📑 Description'], ...actions], { padding: 1 }));
    } else {
        console.log('\n' + ui.separator('🔧 Service Status', 60));
        console.log(ui.color(`${ui.emoji('error')} Claude Code Router is currently offline`, 'red'));
        console.log('\n' + ui.color('💡 Quick Start:', 'yellow'));
        console.log(ui.color('   Run: ccr start', 'green') + ui.color(' to launch the service', 'gray'));
    }
    
    console.log('\n' + ui.border('└', '─', '┘', 60));
}
