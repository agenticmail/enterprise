All done. Here's what I built:                                                                                                                  
                                                                                                                                                 
 ### 1. Setup Wizard — Reverted (no LLM step)                                                                                                    
                                                                                                                                                 
 Reverted back to original. Instead, SDKs auto-install during bootstrap — when an admin creates the first account, the server installs           
 @anthropic-ai/sdk, openai, and elevenlabs in the background.                                                                                    
                                                                                                                                                 
 ### 2. Anthropic Token + API Key Support                                                                                                        
                                                                                                                                                 
 The LLM client now supports two auth modes:                                                                                                     
                                                                                                                                                 
 - api-key (default): Standard x-api-key header — for Anthropic API keys (sk-ant-...)                                                            
 - token: Authorization: Bearer header — for Anthropic Max subscription tokens, OAuth tokens, and proxy tokens (like OpenClaw uses)              
                                                                                                                                                 
 This flows through: ModelConfig.authMode → AgentConfig → agent-loop.ts → callLLM() → callAnthropic() → Anthropic SDK's authToken parameter.     
                                                                                                                                                 
 You can also set a custom baseUrl to point to any proxy endpoint.                                                                               
                                                                                                                                                 
 ### 3. Meeting Voice (ElevenLabs + BlackHole)                                                                                                   
                                                                                                                                                 
 Three new tools when meetings is enabled:                                                                                                       
                                                                                                                                                 
 - meeting_speak — Converts text to speech via ElevenLabs, plays through BlackHole virtual mic. Meeting participants hear the agent speak.       
 - meeting_audio_setup — Checks if BlackHole, sox, and ElevenLabs are configured.                                                                
 - meeting_voices — Lists available voices (13 built-in + custom from ElevenLabs account).                                                       
                                                                                                                                                 
 Architecture (works on any enterprise deployment):                                                                                              
                                                                                                                                                 
 ```                                                                                                                                             
   Agent LLM → "meeting_speak" tool → ElevenLabs API → MP3 file                                                                                  
     → sox plays to BlackHole virtual device                                                                                                     
     → Browser picks up BlackHole as microphone                                                                                                  
     → Meeting participants hear the agent                                                                                                       
 ```                                                                                                                                             
                                                                                                                                                 
 To enable on Mac Mini, you need to run:                                                                                                         
                                                                                                                                                 
 ```bash                                                                                                                                         
   brew install blackhole-2ch   # Virtual audio driver (needs sudo)                                                                              
   brew install sox              # Audio routing to BlackHole                                                                                    
 ```                                                                                                                                             
                                                                                                                                                 
 Then set ELEVENLABS_API_KEY in .env.fola.                                                                                                       
                                                                                                                                                 
 ### 4. PM2 Fix                                                                                                                                  
                                                                                                                                                 
 Ran pm2 save after stopping Fola — this persists the stopped state to the PM2 dump file. The dashboard's stop button only updates DB state but  
 doesn't call pm2 stop. That's a separate fix needed in the deployer (the local stop handler is a no-op).                                        
 connected | idle                 


 PLACESAPI = AIzaSyA4ei8Hkr9vMhweaqwLfdd4rdSKCKiK7is                                                                                   