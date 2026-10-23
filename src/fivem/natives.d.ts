/*
 * Natives de FXServer que usa el agente (runtime de JavaScript de servidor). Solo las necesarias;
 * las firmas siguen la documentación de Cfx.re. Las ofrece el runtime como globales.
 */
declare function GetCurrentResourceName(): string;
declare function GetResourceState(resourceName: string): string;
declare function LoadResourceFile(resourceName: string, fileName: string): string | null;
declare function SaveResourceFile(resourceName: string, fileName: string, data: string, dataLength: number): boolean;
declare function ExecuteCommand(commandString: string): void;
declare function RegisterCommand(commandName: string, handler: (source: number, args: string[], rawCommand: string) => void, restricted: boolean): void;
declare function GetConvar(varName: string, defaultValue: string): string;
declare function PerformHttpRequest(
  url: string,
  callback: (statusCode: number, body: string | null, headers: Record<string, string>) => void,
  method: string,
  data: string,
  headers: Record<string, string>,
): void;
declare function on(eventName: string, handler: (...args: unknown[]) => void): void;
