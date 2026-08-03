// App params - simplified version without BASE44
// Configuration can be passed from Wix via URL params

const getAppParamValue = (paramName, { defaultValue = undefined } = {}) => {
	if (typeof window === 'undefined') {
		return defaultValue;
	}
	const urlParams = new URLSearchParams(window.location.search);
	const searchParam = urlParams.get(paramName);
	return searchParam || defaultValue;
};

export const appParams = {
	// These can be overridden via URL params from Wix
	appId: getAppParamValue('app_id', { defaultValue: 'kan-bonim' }),
};
